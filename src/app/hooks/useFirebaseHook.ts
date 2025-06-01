import { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export interface TranscriptionData {
  senderName: string;
  transcription: string;
  language: string;
  date: Date;
}

export interface FirestoreMessage {
  id: string;
  senderName: string;
  transcription: string;
  language: string;
  date: { toDate: () => Date }; // Firestore timestamp
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
  // Function to fetch messages
  const fetchMessages = useCallback((callback: (messages: FirestoreMessage[]) => void) => {
    if (!isClient || !db) {
      console.warn('Firebase operations are not available on server side');
      return () => {};
    }
    
    try {
      const q = query(
        collection(db, 'transcriptions'),
        orderBy('date', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messages = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as FirestoreMessage[];
        
        callback(messages);
      }, (error) => {
        console.error('Error fetching messages:', error);
        setError(error instanceof Error ? error : new Error('Failed to fetch messages'));
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up messages listener:', error);
      return () => {};
    }
  }, [isClient]);

  return {
    saveTranscription,
    fetchMessages,
    isSaving,
    error,
  };
};
