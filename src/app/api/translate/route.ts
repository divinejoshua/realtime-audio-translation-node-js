import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    let { transcript, targetLanguage } = await request.json();

    let languages = {
      "en": 'English',
      "ha": 'Hausa',
      "sh": 'Shona',
    };
    targetLanguage = languages[targetLanguage] || targetLanguage;
    

    if (!transcript || !targetLanguage) {
      return NextResponse.json(
        { error: 'Transcript and targetLanguage are required' },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only respond with the translated text, no additional commentary.`
        },
        {
          role: 'user',
          content: transcript
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const translatedText = response.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Failed to process translation' },
      { status: 500 }
    );
  }
}