import { spawn } from 'node:child_process';
import { config } from './config.js';

export async function createMinutes(recording) {
  const transcript = await transcribeRecording(recording);
  const summary = await summarizeWithOllama(recording, transcript).catch((error) => {
    console.warn('Ollama summary failed:', error.message);
    return null;
  });

  const header = [
    `**📝 ${formatDate(recording.startedAt)} ${recording.channelName} 議事録**`,
    '',
    `録音時間: ${formatTime(recording.startedAt)} - ${formatTime(recording.endedAt)}`
  ].join('\n');

  if (!transcript.trim()) {
    return `${header}\n\n音声を検出できませんでした。`;
  }

  if (summary) {
    return `${header}\n\n${summary}\n\n**全文文字起こし**\n${transcript}`;
  }

  return `${header}\n\n**全文文字起こし**\n${transcript}`;
}

async function transcribeRecording(recording) {
  const lines = [];

  for (const segment of recording.segments) {
    const result = await transcribeSegment(segment.wavPath);
    for (const item of result.segments) {
      const atMs = segment.offsetMs + Math.round(item.start * 1000);
      const text = item.text.trim();
      if (!text) continue;
      lines.push({
        atMs,
        line: `**${formatOffset(atMs)} ${segment.displayName}:** ${text}`
      });
    }
  }

  return lines
    .sort((a, b) => a.atMs - b.atMs)
    .map((item) => item.line)
    .join('\n');
}

function transcribeSegment(wavPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonBin, [
      'scripts/transcribe.py',
      '--input',
      wavPath,
      '--model',
      config.whisperModel
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`transcribe.py exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse transcription JSON: ${error.message}`));
      }
    });
  });
}

async function summarizeWithOllama(recording, transcript) {
  const prompt = [
    '以下はDiscord VCの話者付き文字起こしです。',
    '日本語で、議事録として簡潔にまとめてください。',
    '形式は必ず次の見出しにしてください: **議題**, **決定事項**, **ToDo**, **補足**。',
    'ToDoは担当者が分かる場合だけ担当者名を書く。推測で担当者を作らない。',
    '',
    `会議: ${recording.channelName}`,
    `日時: ${recording.startedAt.toLocaleString('ja-JP')}`,
    '',
    transcript.slice(0, 24_000)
  ].join('\n');

  const response = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const body = await response.json();
  return body.response?.trim() || null;
}

function formatDate(date) {
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatOffset(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
