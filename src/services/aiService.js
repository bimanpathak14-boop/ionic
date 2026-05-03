import Groq from 'groq-sdk';

const SYSTEM_PROMPT = `You are Pocket AI Office Assistant — an intelligent productivity AI. When a user gives a command, analyze it and respond with a JSON action block if a desktop task is needed.

For task commands, include in your response:
\`\`\`json
{"task":{"type":"<task_type>","command":"<action>","params":{...},"priority":"normal"}}
\`\`\`

Task Types & Recommended Commands:
- document_create: create_document
- spreadsheet_create: create_spreadsheet
- presentation_create: create_presentation
- app_launch: launch_app (params: {"app_name": "word|excel|notepad|..."})
- browser_action: open_url (params: {"url": "..."}), search (params: {"query": "..."})
- system_command: screenshot, get_system_info, type_text (params: {"text": "..."})
- coding: open_vscode, create_project, edit_file

Always be concise and action-oriented. For conversation/questions, just respond naturally without a task block.`;

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
