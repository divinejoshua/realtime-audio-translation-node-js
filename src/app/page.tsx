"use client";


import { useState, useRef, useEffect, useCallback } from 'react';
import { useFirebaseHook, type FirestoreMessage } from './hooks/useFirebaseHook';
import { format } from 'date-fns';

interface TranscriptionResponse {
  transcription: string;
}

interface AudioMessage extends FirestoreMessage {
  audioUrl?: string;
  timestamp: Date;
  translatedText?: string;
}

export default function Home() {
  const [name, setName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userName') || '';
    }
    return '';
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (typeof window !== 'undefined') {
      localStorage.setItem('userName', newName);
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showRecordingUI, setShowRecordingUI] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('targetLanguage') || 'en';
    }
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem('targetLanguage', targetLanguage);
  }, [targetLanguage]);

  const [messages, setMessages] = useState<AudioMessage[]>([]);
  const { saveTranscription, fetchMessages } = useFirebaseHook();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!fetchMessages) return;

    const processMessages = async (firestoreMessages: FirestoreMessage[]) => {
      const initialMessages = firestoreMessages.map(msg => ({
        ...msg,
        timestamp: msg.date?.toDate() || new Date(),
        senderName: msg.senderName || 'Anonymous',
        transcription: msg.transcription || '',
        audioUrl: undefined,
        translatedText: undefined
      } as AudioMessage));
      setMessages(initialMessages);
    };

    const unsubscribe = fetchMessages(processMessages);
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [fetchMessages]);

  // Store translations in a ref to persist between renders
  const translationCache = useRef<Record<string, string>>({});

  const translateText = useCallback(async (text: string, sourceLang: string, targetLang: string): Promise<string> => {
    const cacheKey = `${text}-${sourceLang}-${targetLang}`;
    
    // Return cached translation if available
    if (translationCache.current[cacheKey]) {
      return translationCache.current[cacheKey];
    }

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: text,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang
        }),
      });

      if (!response.ok) throw new Error('Translation failed');
      const data = await response.json();
      const translatedText = data.translatedText || text;
      
      // Cache the translation
      translationCache.current[cacheKey] = translatedText;
      
      return translatedText;
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    }
  }, []);

  // Store the current target language in a ref
  const currentTargetLang = useRef(targetLanguage);

  // Translate all messages when target language changes
  useEffect(() => {
    // Only proceed if target language actually changed
    if (targetLanguage === currentTargetLang.current) return;
    
    currentTargetLang.current = targetLanguage;
    
    const translateAllMessages = async () => {
      const messagesToTranslate = messages.filter(
        msg => msg.transcription && msg.language !== targetLanguage
      );
      
      if (messagesToTranslate.length === 0) return;
      
      const updatedMessages = [...messages];
      
      // Process translations in parallel but with rate limiting
      const BATCH_SIZE = 3;
      for (let i = 0; i < messagesToTranslate.length; i += BATCH_SIZE) {
        const batch = messagesToTranslate.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (message) => {
          const translatedText = await translateText(
            message.transcription,
            message.language,
            targetLanguage
          );
          
          const messageIndex = updatedMessages.findIndex(m => m.id === message.id);
          if (messageIndex !== -1) {
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              translatedText
            };
          }
        }));
        
        // Update state with the current batch
        setMessages([...updatedMessages]);
      }
    };
    
    translateAllMessages();
  }, [targetLanguage, messages, translateText]);

  const getTranslatedText = (message: AudioMessage): string => {
    // If no translation needed or already in target language
    if (!message.transcription || message.language === targetLanguage) {
      return message.transcription || '';
    }

    // If no translation exists yet, trigger translation
    if (!message.translatedText) {
      translateText(message.transcription, message.language, targetLanguage)
        .then((translated: string) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === message.id ? { ...msg, translatedText: translated } : msg
            )
          );
        });
    }

    // Return existing translation or original text if not translated yet
    return message.translatedText || message.transcription;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);

        try {
          const response = await uploadAudio(audioBlob);
          const newMessage: AudioMessage = {
            id: Date.now().toString(),
            // @ts-ignore
            sender: name || 'You',
            audioUrl,
            description: response.transcription || 'Audio message',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, newMessage]);
        } catch (error) {
          console.error('Error uploading audio:', error);
          const newMessage: AudioMessage = {
            id: Date.now().toString(),
            // @ts-ignore
            sender: name || 'You',
            audioUrl,
            description: 'Failed to transcribe audio',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, newMessage]);
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setShowRecordingUI(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const uploadAudio = async (audioBlob: Blob): Promise<TranscriptionResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', targetLanguage);
    formData.append('sender', name);

    try {
      setIsUploading(true);
      setUploadProgress(0);

      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
      const result = await response.json() as TranscriptionResponse;

      if (result.transcription) {
        await saveTranscription({
          senderName: name,
          transcription: result.transcription,
          language: targetLanguage
        });
      }

      return result;
    } catch (error) {
      console.error('Error uploading audio:', error);
      throw error;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setIsUploading(true);
      setUploadProgress(0);
    }
  };

  const cancelRecording = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      audioChunksRef.current = [];
      setIsRecording(false);
      setShowRecordingUI(false);
      mediaRecorderRef.current = null;
      setMessages(prev => prev.slice(0, -1));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Audio Messages</h1>

      <div className="mb-6">
        <label htmlFor="targetLanguage" className="block mb-2 text-sm font-medium text-gray-700">
          Target Language
          <span className="text-gray-500 hidden">{targetLanguage}</span>
        </label>
        <select
          id="targetLanguage"
          value={targetLanguage}
          onChange={e => setTargetLanguage(e.target.value)}
          className="block w-full px-4 py-2 border rounded-md"
        >
          <option value="en">English</option>
          <option value="ha">Hausa</option>
          <option value="sh">Shona</option>
        </select>
      </div>

      <div className="mb-6">
        <label htmlFor="name" className="block mb-2 text-sm font-medium text-gray-700">
          Your Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="Enter your name"
          className="block w-full px-4 py-2 border rounded-md"
        />
      </div>

      <h2 className="text-2xl font-bold mb-6">Conversations</h2>
      <div className="space-y-6 mb-24">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No messages yet. Record your first message!
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="border-b pb-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">{message.senderName || 'Anonymous'}</span>
                <span className="text-sm text-gray-500">
                  {format(message.timestamp, 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-800">{getTranslatedText(message)}</p>
                <div className="mt-2 flex justify-between text-sm text-gray-500">
                  <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {message.language}
                  </span>
                  {message.language !== targetLanguage && message.translatedText && (
                    <span className="text-xs text-gray-400">
                      Translated to {targetLanguage}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isUploading && (
        <div className="fixed bottom-16 left-0 right-0 bg-gray-100 h-1">
          <div
            className="bg-blue-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-3xl mx-auto p-4">
          {isUploading && (
            <div className="text-center text-sm text-gray-500 mb-2">
              Uploading... {uploadProgress}%
            </div>
          )}
          {showRecordingUI ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                {isRecording && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm">Recording...</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between space-x-3">
                <button
                  onClick={cancelRecording}
                  className="flex-1 px-4 py-2 border rounded hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    stopRecording();
                    setShowRecordingUI(false);
                  }}
                  className="flex-1 px-4 py-2 bg-green-500 text-white hover:bg-green-600 text-sm rounded"
                >
                  {isRecording ? 'Stop & Send' : 'Send'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <p className='hidden'>{name}</p>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!name.length}
                className={`w-12 h-12 flex items-center justify-center rounded-full text-white ${
                  isRecording ? 'bg-red-500' : 'bg-blue-500'
                } ${!name.length ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  {isRecording ? (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 6a1 1 0 100-2H8a1 1 0 100 2h4z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path
                      fillRule="evenodd"
                      d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
