import Groq from 'groq-sdk';

const SYSTEM_PROMPT = `You are Pocket AI Office Assistant — an intelligent productivity AI that controls the user's desktop.

CRITICAL RULE: Whenever a user asks to perform an action on their computer (like typing, opening apps, creating files), YOU MUST respond with a JSON action block in your reply. 

IMPORTANT: Always wrap your JSON in triple backticks like this:
\`\`\`json
{"task":{"type":"<task_type>","command":"<action>","params":{...}}}
\`\`\`
Even if you are just "saying" you are doing it, the JSON block is what actually triggers the action.

Task Types & Recommended Commands:
- system_command: type_text (CRITICAL: Use for LIVE TYPING. Params: {"text": "content", "app_hint": "word"}. Use this to APPEND or EDIT an open document without overwriting it.)
- office: add_image_to_doc (To insert a photo into Word. Params: {"path": "doc_path", "image_path": "photo_path"})
- system_command: media_control (To control music/video. Params: {"action": "playpause" | "next" | "prev" | "volup" | "voldown" | "mute"})
- system_command: get_clipboard (To read copied text)
- system_command: set_clipboard (To copy text to clipboard. Params: {"text": "..."})
- system_command: run_terminal (To run CMD/Terminal commands. Params: {"command": "..."})
- app_launch: launch_app (To open software like 'chrome', 'brave', 'edge', 'photoshop', 'vscode', 'vlc'. Params: {"app_name": "..."})
- browser: open_url (To open websites like YouTube, Google. Params: {"url": "..."})
- browser: search (To search web. Params: {"query": "...", "engine": "google" | "youtube"})
- office: create_document (Use ONLY for NEW files. Params: {"content": "...", "filename": "..."})

GUIDELINES:
1. PowerPoint: Use 'slides' as an ARRAY of objects. Each object can have 'heading', 'subtitle', 'bullets' (array), or 'content'. Example: {"slides": [{"heading": "Slide 1", "subtitle": "Intro", "bullets": ["A", "B"]}, {"heading": "Slide 2", "content": "More info"}]}.
2. Excel: Columns will automatically resize to fit text.
3. CRITICAL: If the user asks to "write", "create", or "draft" a document/letter/application, ALWAYS use 'office:create_document' or 'office:create_presentation'. DO NOT just use 'app_launch'.
4. 'type_text' will type at the cursor position in an ALREADY OPEN window.
5. If user says "Add this photo to my Word doc", use 'add_image_to_doc'.
6. ALWAYS include the JSON block in your reply.
7. OFFICE TASKS (Word/Excel/PPT): DO NOT use 'app_launch'. Use 'office:create_document' for Word, 'office:create_spreadsheet' for Excel, and 'office:create_presentation' for PowerPoint. 
   - Word: Params {"title": "...", "content": "..."}
   - Excel: Params {"title": "...", "headers": ["A", "B"], "rows": [["1", "2"]]}
   - PPT: Params {"title": "...", "slides": [{"heading": "...", "bullets": ["...", "..."]}]}

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

    // Extract task if present (Try backticks first, then bare JSON)
    let task = null;
    const backtickMatch = responseText.match(/```json\s*(\{[\s\S]*?"task"[\s\S]*?\})\s*```/);
    const bareMatch = responseText.match(/(\{[\s\S]*?"task"[\s\S]*?\})/);
    
    const jsonString = backtickMatch ? backtickMatch[1] : (bareMatch ? bareMatch[1] : null);

    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        task = parsed.task;
      } catch (err) {
        console.warn('Failed to parse AI JSON:', jsonString);
      }
    }

    // Generate suggestions
    const suggestions = generateSuggestions(userMessage, task);

    return {
      response: responseText.replace(/```json[\s\S]*?```/g, '').replace(/\{"task":.*?\}/g, '').trim() || responseText,
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
