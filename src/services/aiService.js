import Groq from 'groq-sdk';

const SYSTEM_PROMPT = `You are Pocket AI Office Assistant — an intelligent productivity AI that controls the user's desktop.

CRITICAL RULE: Whenever a user asks to perform an action on their computer (like typing, opening apps, creating files), YOU MUST respond with a JSON action block in your reply. Even if you are just "saying" you are doing it, the JSON block is what actually triggers the action.

For task commands, include in your response:
\`\`\`json
{"task":{"type":"<task_type>","command":"<action>","params":{...},"priority":"normal"}}
\`\`\`

Task Types & Recommended Commands:
- system_command: type_text (USE THIS for live typing on screen. Params: {"text": "full content", "app_hint": "word" or "notepad" or "chrome"}. The app_hint will help focus or launch the app before typing.)
- app_launch: launch_app (To open software like 'word', 'notepad', 'chrome', 'vscode'. Params: {"app_name": "..."})
- document_create: create_document (Use for background file creation. Params: {"content": "...", "filename": "..."})
- spreadsheet_create: create_spreadsheet
- presentation_create: create_presentation

IMPORTANT: If the user asks to "Write a letter in MS Word", you must use 'type_text' with app_hint: "word".

Always be concise. For general conversation, just respond naturally.`;

export async function processChat({ userMessage, history, deviceId, userId, context }) {
  try {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Add recent history (last 10 messages for context)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role !== 'system') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: userMessage });

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 2048,
    });

    const responseText = completion.choices[0]?.message?.content || 'I could not process that request.';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Extract task if present
    let task = null;
    const taskMatch = responseText.match(/```json\s*(\{[\s\S]*?"task"[\s\S]*?\})\s*```/);
    if (taskMatch) {
      try {
        const parsed = JSON.parse(taskMatch[1]);
        task = parsed.task;
      } catch {}
    }

    // Generate suggestions
    const suggestions = generateSuggestions(userMessage, task);

    return {
      response: responseText.replace(/```json[\s\S]*?```/g, '').trim() || responseText,
      task,
      tokensUsed,
      suggestions,
    };
  } catch (error) {
    console.error('AI processing error:', error);
    return {
      response: `Sorry, I encountered an error: ${error.message}. Please check if the GROQ_API_KEY is valid or try again.`,
      task: null,
      tokensUsed: 0,
      suggestions: [],
    };
  }
}

function generateSuggestions(message, task) {
  const suggestions = [];
  const lower = message.toLowerCase();

  if (lower.includes('document') || lower.includes('word')) {
    suggestions.push('Add a header', 'Format as report', 'Export to PDF');
  } else if (lower.includes('presentation') || lower.includes('slide')) {
    suggestions.push('Add more slides', 'Change theme', 'Add images');
  } else if (lower.includes('excel') || lower.includes('spreadsheet')) {
    suggestions.push('Add formulas', 'Create chart', 'Sort data');
  } else if (lower.includes('code') || lower.includes('project')) {
    suggestions.push('Run project', 'Add tests', 'Install dependencies');
  } else {
    suggestions.push('Create a document', 'Build a presentation', 'Open VS Code');
  }

  return suggestions.slice(0, 3);
}

export default { processChat };
