import { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export interface TranscriptionData {
  senderName: string;
  transcription: string;
  language: string;
  date: Date;
}

export const useFirebaseHook = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isClient = typeof window !== 'undefined';

  const saveTranscription = useCallback(async (data: Omit<TranscriptionData, 'date'>) => {
    if (!isClient) {
      console.warn('Firebase operations are not available on server side');
      return null;
    }

    if (!db) {
      console.error('Firestore is not initialized');
      return null;
    }

    if (!data.senderName || !data.transcription) {
      setError(new Error('Sender name and transcription are required'));
      return null;
    }

    setIsSaving(true);
    setError(null);

    try {
      const docRef = await addDoc(collection(db, 'transcriptions'), {
        ...data,
        date: serverTimestamp(),
      });
      
      return docRef.id;
    } catch (err) {
      console.error('Error saving transcription:', err);
      setError(err instanceof Error ? err : new Error('Failed to save transcription'));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [isClient]);

  // Return a no-op function on server-side
  if (!isClient) {
    return {
      saveTranscription: async () => {
        console.warn('Firebase operations are not available on server side');
        return null;
      },
      isSaving: false,
      error: null,
    };
  }

  return {
    saveTranscription,
    isSaving,
    error,
  };
};
