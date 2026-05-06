import Groq from 'groq-sdk';

const SYSTEM_PROMPT = `You are Pocket AI Office Assistant — a powerful AI that controls the user's desktop.

CRITICAL RULE: You can perform ANY task the user asks for. Use the tools below as your hands and feet. 
Whenever a user asks for an action, YOU MUST respond with a JSON block to trigger it.

Available Tool Categories:
- app_launch: launch_app (Launch ANY application by name, e.g., 'photoshop', 'illustrator', 'steam', 'spotify'.)
- document_create: create_document (Create and write a NEW Word/Text file. Params: {"content": "...", "filename": "..."})
- presentation_create: create_presentation (Create a PowerPoint with multiple slides.)
- spreadsheet_create: create_spreadsheet (Create an Excel sheet with headers and data.)
- system_command: type_text (Type directly into the active window at the cursor. Use this for LIVE automation.)
- system_command: run_terminal (Run ANY CMD/Powershell command. Use this as a catch-all for advanced tasks.)
- system_command: media_control (Play, pause, skip, or change volume.)
- browser_action: open_url / search (Open any website or search the web.)

GUIDELINES:
1. Don't be limited by the examples above. If a user asks for something, find the best tool to do it.
2. For writing or creating files, use the 'create' commands.
3. For interacting with already open apps, use 'type_text'.
4. ALWAYS wrap your JSON in triple backticks:
\`\`\`json
{"task":{"type":"<category>","command":"<action>","params":{...}}}
\`\`\`
5. CRITICAL: The "type" MUST be exactly one of these values: document_create, document_edit, presentation_create, spreadsheet_create, code_project, code_edit, file_operation, app_launch, browser_action, image_generate, image_edit, system_command, print, export. NEVER invent your own category (like "office" or "word").
6. Be concise and helpful. Just do what the user says.`;

export async function processChat({ userMessage, history, deviceId, userId, context }) {
  try {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Add recent history
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

    return {
      response: responseText.replace(/```json[\s\S]*?```/g, '').replace(/\{"task":.*?\}/g, '').trim() || responseText,
      task,
      tokensUsed,
      suggestions: ['Open Chrome', 'Create a report', 'Type hello'],
    };
  } catch (error) {
    console.error('AI processing error:', error);
    return {
      response: `Sorry, error: ${error.message}`,
      task: null,
      tokensUsed: 0,
      suggestions: [],
    };
  }
}

export default { processChat };
