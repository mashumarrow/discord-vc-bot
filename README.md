# Discord VC Minutes Bot

Windows PC上で動かす、Discord VC用のローカル議事録Botです。

- `/start` で実行者が入っているVCへ参加して録音
- 話者ごとに音声を分割保存
- `faster-whisper` で日本語文字起こし
- OllamaのローカルLLMで議事録化
- Discordのテキストチャンネルへ投稿

## 必要なもの

- Node.js 24.17.0以上
- Python 3.10以上
- FFmpeg
- Ollama
- Discord Bot Token

## セットアップ

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env` にDiscord Developer Portalで取得した値を入れます。

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
```

Botには次の権限を付けてサーバーへ招待してください。

- `applications.commands`
- `bot`
- View Channels
- Send Messages
- Connect
- Speak

## Slash Command登録

```powershell
npm run commands
```

## 起動

Ollamaを起動し、使うモデルを入れておきます。

```powershell
ollama pull llama3.1:8b
ollama serve
```

別のターミナルでBotを起動します。

```powershell
npm start
```

Discordで録音したいVCに入ってから `/start`、終了時に `/stop` を実行してください。

## 注意

VC参加者には、録音・文字起こしを行うことを必ず明示してください。このBotは `/start` 時に録音通知を投稿します。

Discordの音声受信はDiscord側で正式文書化された安定APIではないため、Discordや `@discordjs/voice` の更新で調整が必要になる可能性があります。
