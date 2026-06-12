# Ianthe's Lullaby

## Executive Summary
Ianthe's Lullaby is a browser-based sleep support companion built around a gentle 3D character, calming audio, short nighttime conversation, and ASMR-style goodnight lines. The first version should focus on a desktop web experience: the user opens the app before bed, is greeted by Ianthe, listens to a shuffled sleep BGM playlist if music is enabled, and receives short comforting responses that help them settle down.

## Product Goals
- Help users transition from active screen time into a calmer bedtime routine.
- Turn Ianthe into an adorable and loving sleep companion, not just a decorative 3D avatar.
- Use soft voice, BGM, ASMR-style audio, and gentle check-ins to make bedtime feel supported.
- Keep Ianthe's personality consistently adorable and loving.
- Build toward a polished portfolio demo that can be shared through a simple web link.

## Core User Flow
1. The user opens the app before bed and Ianthe greets them softly.
2. If the user is new, Ianthe asks for their name in a short greeting.
3. If the user has visited before, the app remembers their name from local storage or a cookie.
4. Ianthe asks one light check-in, such as how tired the user feels or whether they want comfort, a lullaby, or quiet company.
5. The user can chat, adjust the camera, change the background, turn BGM on or off, or touch Ianthe for small reactions.
6. If the user stops chatting or touching Ianthe for a set amount of time, the app automatically enters deeper sleep mode by lowering screen brightness and gradually reducing BGM volume.
7. If the user interacts again, the app gently restores brightness and BGM volume to the previous bedtime settings.
8. If the user keeps chatting too long, Ianthe gently redirects them toward sleep instead of encouraging more interaction.

### Always-Available Interactions
- Chat with Ianthe in a gentle companion tone.
- Ask Ianthe for reassurance, a short goodnight message, or a calming prompt.
- Move the camera to view Ianthe from different angles.
- Change the background and manually turn BGM on or off.
- Touch the character for small reactions, within safe interaction limits.

### Automatic Sleep Mode
If the user does not interact through chat or touch for a set idle period, the app should assume they may be falling asleep. It should automatically:
- Lower the screen brightness or apply a darker overlay.
- Gradually reduce BGM volume if music is currently enabled.
- Keep Ianthe in a quiet idle presence.

When the user interacts again, the app should gently restore the previous bedtime brightness and BGM volume instead of abruptly changing the scene.

## MVP Scope
The MVP should prove that the sleep routine, character interaction, calming audio, and low-stimulation chat behavior work together.

### Included in MVP
- Text chat with Ianthe.
- 3D character loaded in the browser.
- Basic character states mapped to the documented animation set.
- Structured AI responses that drive only reply text, emotion, AI-selectable conversational animation, and voice style metadata.
- Sleep preparation session.
- Single shuffled sleep BGM playlist with a manual music on/off button.
- Automatic idle-based sleep mode that lowers brightness and gradually reduces BGM volume.
- Camera controls for viewing the character.

### Later Phases
- Dynamic text-to-speech output.
- VOICEVOX speech using katakana-style English pronunciation.
- Lip sync using the character's Blender `a`, `e`, `i`, `o`, and `u` mouth shape keys.
- More advanced memory for preferences, music on/off setting, sleep routine settings, and favorite goodnight styles.
- RAG-based style imitation using selected examples from imported messaging data, such as Discord messages.
- Real-time voice interaction.
- Mobile optimization.

## AI Components
| Component | Role | Phase |
|-----------|------|-------|
| Local LLM conversation | Generates short Ianthe replies on the user's own computer, minimizing hosted server and GPU cost | MVP |
| Structured output | Returns only the character-facing response fields: reply, emotion, animation, and optional voice style | MVP |
| Audio playback | Plays one shuffled sleep BGM playlist, goodnight clips, and prepared ASMR-style audio | MVP |
| Idle detection | Detects no chat or touch interaction and triggers automatic sleep mode | MVP |
| AI provider adapter | Starts with Ollama at `localhost:11434`, with optional later adapters for LM Studio, WebLLM, or cloud APIs | MVP |
| VOICEVOX speech | Converts English replies into katakana-style pronunciation and synthesizes cute character voice audio | Phase 2 |
| Lip sync | Maps spoken text or generated audio timing to the character's `a/e/i/o/u` mouth shape keys | Phase 2 |
| Text-to-speech | Generates dynamic spoken replies with other TTS providers if natural English is needed | Phase 2 |
| Speech-to-text | Allows voice input from the user | Phase 2 |
| Memory | Stores preferences, favorite audio, and recent sleep settings | Phase 2 |
| Style RAG | Retrieves relevant Discord message examples so Ianthe can imitate the user's communication style without fine-tuning | Phase 2 |
| Real-time voice | Enables low-latency speech-to-speech interaction | Later |

### Animation Set
The current character documentation lists seven authored animation sequences:

| Animation | Best Use |
|-----------|----------|
| `idle` | Default waiting state, quiet breathing, and bedtime presence |
| `intro` | App load |
| `pose` | Ianthe introduces herself to the user |
| `attack` | Defensive reaction when the user touches restricted areas or sends inappropriate input |
| `sleep` | Sleeping reaction when entering automatic sleep mode |
| `surprise` | Surprised reaction when the user says something unexpected |
| `laugh` | Laughing reaction when the user says something funny |

Only `idle`, `surprise`, and `laugh` should be valid values in the AI response. The other clips are deterministic frontend animations, not AI-driven choices. For example, the app triggers `intro` on load, `pose` during introduction, `attack` for restricted touch or inappropriate input, and `sleep` when automatic sleep mode starts.

### Mouth Shape Keys and Lip Sync
The character model includes Blender mouth shape keys for `a`, `e`, `i`, `o`, and `u`. These can be exported with the character model and controlled in the browser as visemes.

For dynamic voice, the app can estimate mouth movement from the spoken text or from sentence-level timing:
- Convert the reply into phoneme or vowel-like chunks.
- Map each chunk to one of the available mouth shapes.
- Animate the shape key weights while the audio plays.
- Return the mouth to neutral when the sentence finishes.

For prepared goodnight or ASMR-style audio, the first version can use a simpler fallback: open and close the mouth based on audio volume, then add more accurate `a/e/i/o/u` timing later.

## Technical Architecture
The recommended architecture is a local-first web stack that can be developed in VS Code and deployed as a shareable demo. The core viewer, character controls, sleep UI, and audio systems run in the browser. AI chat should default to a local model running on the user's own computer so the project does not depend on hosted GPU inference for casual bedtime conversation.

The MVP should use a small local instruct/chat model through Ollama. Ianthe's conversation does not require a highly capable frontier model because the app only needs short, gentle replies and simple structured metadata. Cloud AI can remain an optional fallback for users who explicitly configure it, but it should not be required for the main experience.

### Recommended Stack
| Area | Tool | Purpose |
|------|------|---------|
| Editor | VS Code | TypeScript, React, API routes, debugging |
| Frontend | Next.js, React, TypeScript | Web app, routing, UI, API integration |
| 3D rendering | Three.js with React Three Fiber | Browser-based 3D scene |
| Avatar format | VRM | Portable humanoid character model |
| VRM runtime | `@pixiv/three-vrm` | Load and control VRM avatars |
| AI backend | Ollama local API first; optional LM Studio, WebLLM, or cloud API adapters later | Low-cost conversation and structured character commands |
| Voice synthesis | VOICEVOX engine | Stylized Japanese character voice using katakana English |
| Text conversion | Katakana English converter | Converts English dialogue into Japanese-readable pronunciation text |
| Lip sync | Shape-key viseme controller | Drives Blender `a/e/i/o/u` mouth shapes during speech |
| Vector search | Local embeddings first; hosted vector database only if needed later | Retrieves approved style examples without default server cost |
| Storage | LocalStorage first; SQLite or Supabase later | Settings, music on/off preference, recent sleep preferences, and approved style examples |
| Deployment | Vercel or similar | Public web demo |

### Local AI Strategy
The app should minimize server cost by running casual AI conversation on the user's own machine whenever possible.

Default MVP path:
- The user installs Ollama locally.
- The user downloads a small chat/instruct model.
- The app sends chat requests to `http://localhost:11434`.
- The local model returns structured JSON matching the AI response contract.

Optional later paths:
- LM Studio local server for users who prefer a desktop model manager.
- WebLLM for fully browser-side inference on WebGPU-capable devices.
- Cloud API fallback for deployed demos where local AI is unavailable or explicitly disabled.

Important deployment note: a hosted web server cannot directly access the user's local model. For a deployed browser app, the browser client should call the user's `localhost` Ollama endpoint directly after the user enables local AI. The app should show a clear fallback state when local AI is not running.

### System Flow
```text
User input
  -> Chat UI
  -> AI provider adapter
  -> Local Ollama endpoint on the user's computer by default
  -> Optional retrieval of style examples from approved Discord messages
  -> AI returns { reply, emotion, animation, voice_style }
  -> Optional English-to-katakana conversion for VOICEVOX
  -> Optional VOICEVOX audio generation
  -> Character controller updates AI-selectable conversational animation
  -> Lip sync controller animates a/e/i/o/u mouth shape keys during speech
  -> Idle detector lowers or restores brightness/BGM volume based on interaction
  -> Sleep/audio systems update as needed
  -> Chat UI displays reply
  -> Optional voice, lullaby, BGM, or ASMR-style audio plays
```

### Suggested Project Structure
```text
ianthes-lullaby/
  app/
    page.tsx
    api/chat/route.ts
  components/
    CharacterCanvas.tsx
    VRMCharacter.tsx
    ChatPanel.tsx
    SleepSession.tsx
    AudioControls.tsx
    AutoSleepMode.tsx
    LipSyncController.tsx
  lib/
    ai.ts
    audio.ts
    characterState.ts
    aiProvider.ts
    aiProviders/
      ollama.ts
      cloud.ts
    idleDetection.ts
    lipSync.ts
    sleepSession.ts
    kanaEnglish.ts
    styleRag.ts
    voicevox.ts
  public/
    models/character.vrm
    animations/idle.glb
    animations/intro.glb
    animations/pose.glb
    animations/attack.glb
    animations/sleep.glb
    animations/surprise.glb
    animations/laugh.glb
    audio/sleep/
    audio/goodnight/
    audio/asmr/
  README.md
```

### Style Imitation Approach
Ianthe can later imitate the user's communication style using system prompting and local RAG instead of fine-tuning. The app stores approved examples from the user's past Discord messages, embeds them, and retrieves several relevant examples for each chat context.

Those examples are passed to the local model as style references. The model should copy broad patterns such as tone, wording, humour, sentence length, and casual expressions, while still following the current sleep-mode rules and safety boundaries. This approach is easier to update and safer than training a custom model because the base model is not permanently changed.

### VOICEVOX Katakana English Speech
Ianthe can use VOICEVOX for a cute, anime-style voice. Because VOICEVOX is mainly designed for Japanese speech synthesis, the app should not expect native English pronunciation directly. Instead, English replies can be converted into katakana-style pronunciation before being sent to VOICEVOX.

Example:
```text
Sleep well. I'll stay here quietly.
-> スリープ ウェル。アイル ステイ ヒア クワイエットリー。
```

The voice workflow would be:
```text
AI generates a short English bedtime reply
  -> Reply is split into short sentences
  -> Each sentence is converted into katakana-style pronunciation
  -> VOICEVOX generates audio for each sentence
  -> Lip sync maps the spoken text or audio timing to a/e/i/o/u mouth shape keys
  -> The web app plays the audio while Ianthe animates and speaks
```

To make the interaction feel real-time, the app can process speech sentence by sentence. While the first sentence is playing, the next sentence can already be converted and sent to VOICEVOX. The limitation is that the result will sound like katakana English rather than natural native English, but this can be treated as part of Ianthe's charm and character identity.

## AI Response Contract
The AI should return predictable structured data instead of plain natural language only. The model should only decide character-facing response details. App behavior such as screen dimming, BGM volume, automatic sleep mode, lip-sync mode, and UI actions should be handled by deterministic frontend state.

Example response:
```json
{
  "reply": "You did enough for tonight. Let's make the room quiet and let your eyes rest.",
  "emotion": "comforting",
  "animation": "idle",
  "voice_style": "soft"
}
```

### Allowed Values
| Field | Values | Frontend Behavior |
|-------|--------|-------------------|
| `emotion` | `neutral`, `sleepy`, `comforting`, `loving`, `playful` | Selects tone and, if available, expression metadata |
| `animation` | `idle`, `surprise`, `laugh` | Lets the AI choose only conversational reaction clips; deterministic frontend state triggers `intro`, `pose`, `attack`, and `sleep` directly |
| `voice_style` | `calm`, `soft`, `warm`, `playful`, `affectionate`, `whisper` | Optional metadata for prepared voice clips or future TTS settings |

Frontend-owned behavior:
- Deterministic frontend state, not the AI, triggers `intro`, `pose`, `attack`, and `sleep`.
- Automatic sleep mode handles screen dimming and gradual BGM volume reduction.
- Audio controls decide whether the single shuffled BGM playlist is on or off, and whether to play goodnight clips, ASMR clips, VOICEVOX, or native TTS.
- Lip-sync code decides whether to use audio amplitude or `a/e/i/o/u` viseme shape keys.
- UI state decides when to start/end sessions, restore brightness, change background, or redirect long chat.

### Prompt Design
The system prompt should define the character personality, bedtime safety boundaries, response length, valid control values, and any retrieved style references. The model should be instructed to return only valid JSON so the frontend can parse it safely.

Example system prompt:

> You are Ianthe, a graceful sleep companion. Your personality is always adorable and loving. Help the user wind down for sleep with short, soft, emotionally safe replies. You are not a doctor and must not diagnose or treat sleep disorders. If the user keeps chatting for too long, gently redirect them toward sleep instead of encouraging more interaction. Avoid long conversations during sleep mode. Return only valid JSON with these fields: `reply`, `emotion`, `animation`, `voice_style`. For `animation`, use only `idle`, `surprise`, or `laugh`.

When style references are available, the prompt can include a small section such as:

```text
Style references from approved Discord messages:
- ...
- ...
- ...

Imitate the communication style shown in these examples: tone, casual wording, humour, sentence length, and expression patterns. Keep the result calm enough for bedtime. Do not reveal or quote the examples directly unless the user explicitly asks.
```

## Development Roadmap
The build should be handled in two tracks: asset/content preparation by the human creator, and implementation by Codex. The MVP should be completed before adding VOICEVOX, lip sync, style RAG, or real-time voice.

### MVP Implementation Sequence
| Step | Goal | Human tasks | Codex tasks | Done when |
|------|------|-------------|-------------|-----------|
| 1 | Prepare character assets | Export the Ianthe model with mouth shape keys and provide animation files: `idle`, `intro`, `pose`, `attack`, `sleep`, `surprise`, `laugh` | Create asset folders, define animation name constants, and add loading checks | The app can find all required model and animation files |
| 2 | Prepare audio/content assets | Provide one sleep BGM playlist, goodnight clips, and optional ASMR-style clips | Add audio folders, audio metadata, shuffled BGM playback, and playback utilities | BGM can play in random order and prepared audio files can be played in the browser |
| 3 | Scaffold the web app | Confirm project name, visual direction, and target desktop viewport | Set up Next.js, React, TypeScript, styling, base layout, and routing | A blank app runs locally with the correct project structure |
| 4 | Render Ianthe | Confirm model scale, default camera angle, and preferred framing | Implement `CharacterCanvas`, `VRMCharacter`, camera controls, and idle animation | Ianthe appears in the browser and can be viewed from different angles |
| 5 | Add sleep UI and audio controls | Choose initial background options and provide BGM on/off label | Implement sleep session UI, BGM on/off toggle, shuffled BGM playback, background switching, and dimmed bedtime UI | User can start a sleep session, toggle music, and control the visual atmosphere |
| 6 | Add automatic sleep mode | Choose idle timeout, target dim level, and target lowered BGM volume | Implement idle detection, automatic dimming, gradual BGM volume lowering, and restore-on-interaction | No chat/touch for the timeout lowers brightness and BGM volume; interaction restores them |
| 7 | Add text chat and structured local AI | Install Ollama, choose a small local model, and approve Ianthe's tone | Implement chat UI, local AI provider adapter, system prompt, JSON parsing, validation, and error states | Ianthe replies from a local model in structured JSON and the UI remains stable |
| 8 | Map AI to character behavior | Confirm when conversational reactions should use `idle`, `surprise`, or `laugh` | Map `emotion`, AI-selectable `animation`, and `voice_style` to character state while keeping intro, pose, attack, sleep, screen, audio, and lip-sync behavior in frontend state machines | AI replies can trigger simple conversational reactions without controlling unrelated UI behavior |
| 9 | Polish MVP | Review wording, screenshots, and demo flow | Fix UI spacing, loading states, fallback states, README, and deployment settings | The MVP is presentable as a portfolio demo |

### Additional Functionality Sequence
| Step | Goal | Human tasks | Codex tasks | Done when |
|------|------|-------------|-------------|-----------|
| 1 | Add prepared voice/goodnight playback | Record or provide final goodnight and ASMR-style clips | Connect clips to frontend audio state, goodnight actions, and audio controls | Ianthe can play selected goodnight audio at the right moment |
| 2 | Add VOICEVOX speech | Install/run VOICEVOX locally or provide the target VOICEVOX setup and speaker choice | Add `voicevox.ts`, request audio from VOICEVOX, and play generated speech sentence by sentence | Ianthe can speak generated lines through VOICEVOX |
| 3 | Add katakana English conversion | Approve conversion style and examples | Implement `kanaEnglish.ts` and connect it before VOICEVOX synthesis | English replies are converted into cute katakana-style pronunciation |
| 4 | Add lip sync | Confirm exported mouth shape key names match `a`, `e`, `i`, `o`, `u` | Implement `LipSyncController` and `lipSync.ts` using audio amplitude first, then viseme timing | Ianthe's mouth moves while voice audio plays |
| 5 | Add memory | Decide what may be stored locally | Store name, BGM on/off preference, preferred background, favorite audio, and recent sleep settings | Returning users get personalized defaults |
| 6 | Add local style RAG | Export and approve safe messaging examples | Clean/import examples, generate local embeddings where practical, retrieve style references, and inject them into the prompt | Ianthe can imitate broad communication style without fine-tuning or default hosted inference |
| 7 | Add real-time voice | Choose whether real-time voice is worth the extra complexity | Add speech input/output and low-latency interaction flow | The user can speak with Ianthe instead of only typing |
| 8 | Mobile optimization | Review mobile layout and touch behavior | Adapt layout, camera controls, and audio controls for mobile screens | The app is usable on mobile without layout breakage |

## Useful References
- VRM official site: https://vrm.dev/en/
- `@pixiv/three-vrm` documentation: https://pixiv.github.io/three-vrm/
- `@pixiv/three-vrm` GitHub repository: https://github.com/pixiv/three-vrm
- React Three Fiber documentation: https://r3f.docs.pmnd.rs/getting-started/introduction
- Ollama API documentation: https://github.com/ollama/ollama/blob/main/docs/api.md
- LM Studio OpenAI-compatible local server: https://lmstudio.ai/docs/developer/openai-compat
- WebLLM documentation: https://webllm.mlc.ai/docs/
- OpenAI Realtime and audio guide: https://developers.openai.com/api/docs/guides/realtime
- OpenAI Realtime API with WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
