import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    console.log('Received request to /api/speech-to-text');
    
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = formData.get('language') as string || 'english';
    const sender = formData.get('sender') as string || 'You';
    
    if (!audioFile) {
      console.error('No audio file provided');
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Convert the audio file to a buffer
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Create a unique filename
    const filename = `${uuidv4()}.wav`;
    const uploadDir = join(process.cwd(), 'temp');
    const filePath = join(uploadDir, filename);
    
    try {
      // Ensure upload directory exists
      const fs = await import('fs');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Save the file temporarily
      await writeFile(filePath, buffer);
      console.log(`Saved audio file to ${filePath}`);
      
      // Transcribe using OpenAI Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
        language: language,
      });
      
      console.log('Transcription successful');
      
      return NextResponse.json({
        success: true,
        transcription: transcription.text,
        language,
        sender,
      });
      
    } catch (error) {
      console.error('Error during transcription:', error);
      return NextResponse.json(
        { error: 'Failed to transcribe audio', details: error },
        { status: 500 }
      );
    } finally {
      // Clean up the temporary file
      const fs = await import('fs');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
  } catch (error) {
    console.error('Error in /api/speech-to-text:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error },
      { status: 500 }
    );
  }
}