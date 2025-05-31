import { NextResponse } from 'next/server';


export async function POST(request: Request) {
    console.log('Received request to /api/speech-to-text');
    
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = formData.get('language') as string || 'en';
    const sender = formData.get('sender') as string || 'You';
    
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
        sender,
      });
    
}