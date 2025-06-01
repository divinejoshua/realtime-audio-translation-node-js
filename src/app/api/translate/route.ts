import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type LanguageCode = 'en' | 'ha' | 'sh' | string;

export async function POST(request: Request) {
  try {
    const { transcript, sourceLanguage, targetLanguage } = await request.json() as {
      transcript: string;
      sourceLanguage: LanguageCode;
      targetLanguage: LanguageCode;
    };

    const languageMap: Record<LanguageCode, string> = {
      "en": 'English',
      "ha": 'Hausa',
      "sh": 'Shona',
    };
    
    const sourceLangName = languageMap[sourceLanguage] || sourceLanguage;
    const targetLangName = languageMap[targetLanguage] || targetLanguage;

    if (!transcript || !sourceLanguage || !targetLanguage) {
      return NextResponse.json(
        { error: 'Transcript, sourceLanguage, and targetLanguage are required' },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text from ${sourceLangName} to ${targetLangName}. Only respond with the translated text, no additional commentary.`
        },
        {
          role: 'user',
          content: `Original language: ${sourceLangName}\nTarget language: ${targetLangName}\n\nText to translate: "${transcript}"`
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