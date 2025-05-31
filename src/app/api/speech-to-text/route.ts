import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';


export async function POST(request: Request) {
    console.log('Received request to /api/speech-to-text');
    
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = formData.get('language') as string || 'en';
    
    if (!audioFile) {
      console.error('No audio file provided');
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }
    
    const transcription ="await transcribeAudio(audioFile, language)"

      return NextResponse.json({
        success: true,
        transcription,
        language,
        duration: '2.5s' // Mock duration
      });
    
}