import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manual .env loader (No dotenv dependency)
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const [key, ...value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.join('=').trim().replace(/^"|"$/g, '');
      }
    });
  } catch (err) {
    console.error('Could not find or read .env file');
  }
}

async function testGroq() {
  loadEnv();
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    console.error('Error: GROQ_API_KEY not found in .env file');
    return;
  }

  console.log('Testing AI with Direct Fetch (No dependencies)...');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "AI is 100% working!"' }],
        model: 'llama-3.3-70b-versatile',
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    console.log('\n✅ SUCCESS! AI Response:', data.choices[0].message.content);
    console.log('\nAb aap "npm install" wala fix try kariye taaki backend start ho sake.');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testGroq();
