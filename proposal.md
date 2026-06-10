# Ianthe's Lullaby

## Executive Summary
Ianthe's Lullaby is a browser-based sleep support companion built around a gentle 3D character, calming audio, short nighttime conversation, and ASMR-style goodnight lines. The first version should focus on a desktop web experience: the user opens the app before bed, is greeted by Ianthe, chooses a wind-down mode, listens to sleep BGM or ambient sound, and receives short comforting responses that help them settle down.

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
5. The user can chat, adjust the camera, change the background, change the sleep playlist, or touch Ianthe for small reactions.
6. If the user stops chatting or touching Ianthe for a set amount of time, the app automatically enters deeper sleep mode by lowering screen brightness and reducing music volume.
7. If the user interacts again, the app gently restores brightness and music volume to the previous bedtime settings.
8. If the user keeps chatting or touching Ianthe for more than 10 minutes, Ianthe becomes a little concerned and reminds them not to stay up too late.
9. If the user continues after the concern reminder, Ianthe becomes slightly annoyed and says a firmer line such as, "Go sleep now."
10. Once the user stops interacting and the app returns to automatic sleep mode, the wake-up/interruption counter resets.

### Always-Available Interactions
- Chat with Ianthe in a gentle companion tone.
- Ask Ianthe for reassurance, a short goodnight message, or a calming prompt.
- Move the camera to view Ianthe from different angles.
- Ask Ianthe to change the sleep playlist, ambient sound, BGM, or background.
- Touch the character for small reactions, within safe interaction limits.

### Automatic Sleep Mode
If the user does not interact through chat or touch for a set idle period, the app should assume they may be falling asleep. It should automatically:
- Lower the screen brightness or apply a darker overlay.
- Reduce sleep BGM or ambient sound volume.
- Keep Ianthe in a quiet idle presence.

When the user interacts again, the app should gently restore the previous bedtime brightness and music volume instead of abruptly changing the scene.

### Extended Interaction Guard
The app should track continuous user interaction through chat prompts and touch events. If interaction continues for more than 10 minutes during bedtime mode, Ianthe should shift from soft conversation into a bedtime reminder.

Escalation pattern:
1. First 10 minutes: normal soft replies.
2. After 10 minutes: concerned reminder, such as "You should go sleep now. Don't stay awake too late."
3. If the user continues: slightly annoyed bedtime redirect, such as "Looks like you need this final lullaby!"
4. Immediately reset the wake-up/interruption counter.

## MVP Scope
The MVP should prove that the sleep routine, character interaction, calming audio, and low-stimulation chat behavior work together.

### Included in MVP
- Desktop browser app.
- Text chat with Ianthe.
- 3D character loaded in the browser.
- Basic character states mapped to the documented animation set.
- Structured AI responses that drive emotion, animation, voice mode, and next UI action.
- Sleep preparation session.
- Sleep BGM or ambient sound selection.
- Dimmed bedtime UI mode.
- Automatic idle-based sleep mode that lowers brightness and music volume.
- 10-minute continuous interaction guard with concerned and slightly annoyed bedtime reminders.
- Short end-of-session goodnight or ASMR-style comfort audio.
- Camera controls for viewing the character.

### Later Phases
- Dynamic text-to-speech output.
- VOICEVOX speech using katakana-style English pronunciation.
- Lip sync using the character's Blender `a`, `e`, `i`, `o`, and `u` mouth shape keys.
- More advanced memory for preferences, playlist history, sleep routine patterns, and favorite goodnight styles.
- RAG-based style imitation using selected examples from imported messaging data, such as Discord messages.
- Real-time voice interaction.
- Mobile optimization.

## AI Components
| Component | Role | Phase |
|-----------|------|-------|
| LLM conversation | Generates short Ianthe replies that respect bedtime mode and her fixed adorable, loving personality | MVP |
| Structured output | Returns emotion, animation, voice mode, sleep behavior, and next action as JSON | MVP |
| Audio playback | Plays sleep BGM, ambient sound, goodnight clips, and prepared ASMR-style audio | MVP |
| Idle detection | Detects no chat or touch interaction and triggers automatic sleep mode | MVP |
| Interaction timer | Tracks continuous chat/touch interaction and escalates bedtime reminders after 10 minutes | MVP |
| VOICEVOX speech | Converts English replies into katakana-style pronunciation and synthesizes cute character voice audio | Phase 2 |
| Lip sync | Maps spoken text or generated audio timing to the character's `a/e/i/o/u` mouth shape keys | Phase 2 |
| Text-to-speech | Generates dynamic spoken replies with other TTS providers if natural English is needed | Phase 2 |
| Speech-to-text | Allows voice input from the user | Phase 2 |
| Memory | Stores preferences, favorite audio, and recent sleep sessions | Phase 2 |
| Style RAG | Retrieves relevant Discord message examples so Ianthe can imitate the user's communication style without fine-tuning | Phase 2 |
| Sleep journal | Stores optional user reflections and morning notes | Later |
| Real-time voice | Enables low-latency speech-to-speech interaction | Later |

### Animation Set
The current character documentation lists seven authored animation sequences:

| Animation | Best Use |
|-----------|----------|
| `idle` | Default waiting state, quiet breathing, and bedtime presence |
| `intro` | App load |
| `pose` | Ianthe introduces herself to the user |
| `victory` | Slightly annoyed bedtime redirect when the user keeps interacting too long |
| `fail` | Sleepy or failed-to-wake-up reaction when entering automatic sleep mode |
| `taunt1` | Surprised reaction when the user says something unexpected |
| `taunt2` | Laughing reaction when the user says something funny |

### Mouth Shape Keys and Lip Sync
The character model includes Blender mouth shape keys for `a`, `e`, `i`, `o`, and `u`. These can be exported with the character model and controlled in the browser as visemes.

For dynamic voice, the app can estimate mouth movement from the spoken text or from sentence-level timing:
- Convert the reply into phoneme or vowel-like chunks.
- Map each chunk to one of the available mouth shapes.
- Animate the shape key weights while the audio plays.
- Return the mouth to neutral when the sentence finishes.

For prepared goodnight or ASMR-style audio, the first version can use a simpler fallback: open and close the mouth based on audio volume, then add more accurate `a/e/i/o/u` timing later.

## Technical Architecture
The recommended architecture is a web-first stack that can be developed in VS Code and deployed as a shareable demo. This keeps the character, audio, and AI interaction easy to share through a browser link.

### Recommended Stack
| Area | Tool | Purpose |
|------|------|---------|
| Editor | VS Code | TypeScript, React, API routes, debugging |
| Frontend | Next.js, React, TypeScript | Web app, routing, UI, API integration |
| 3D rendering | Three.js with React Three Fiber | Browser-based 3D scene |
| Avatar format | VRM | Portable humanoid character model |
| VRM runtime | `@pixiv/three-vrm` | Load and control VRM avatars |
| AI backend | OpenAI API or equivalent LLM API | Conversation and structured character commands |
| Interaction timer | Client-side timer/state machine | Tracks continuous chat/touch use, escalation stage, and counter reset |
| Voice synthesis | VOICEVOX engine | Stylized Japanese character voice using katakana English |
| Text conversion | Katakana English converter | Converts English dialogue into Japanese-readable pronunciation text |
| Lip sync | Shape-key viseme controller | Drives Blender `a/e/i/o/u` mouth shapes during speech |
| Vector search | Local embeddings or hosted vector database | Retrieves style examples and future journal entries |
| Storage | LocalStorage first; SQLite or Supabase later | Settings, playlist choices, sleep session history, and approved style examples |
| Deployment | Vercel or similar | Public web demo |

### System Flow
```text
User input
  -> Chat UI
  -> API route / AI service
  -> Optional retrieval of style examples from approved Discord messages
  -> AI returns { reply, emotion, animation, next_action, sleep_behavior, voice_mode, mouth_mode }
  -> Optional English-to-katakana conversion for VOICEVOX
  -> Optional VOICEVOX audio generation
  -> Character controller updates animation
  -> Lip sync controller animates a/e/i/o/u mouth shape keys during speech
  -> Interaction timer updates bedtime reminder stage or resets on automatic sleep
  -> Idle detector lowers or restores brightness/music volume based on interaction
  -> Sleep/audio systems update as needed
  -> Chat UI displays reply
  -> Optional voice, lullaby, ambient, or ASMR-style audio plays
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
    idleDetection.ts
    interactionTimer.ts
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
    animations/victory.glb
    animations/fail.glb
    animations/taunt1.glb
    animations/taunt2.glb
    audio/sleep/
    audio/goodnight/
    audio/asmr/
  README.md
```

### Style Imitation Approach
Ianthe can later imitate the user's communication style using system prompting and RAG instead of fine-tuning. The app stores approved examples from the user's past Discord messages, embeds them, and retrieves several relevant examples for each chat context.

Those examples are passed to the model as style references. The model should copy broad patterns such as tone, wording, humour, sentence length, and casual expressions, while still following the current sleep-mode rules and safety boundaries. This approach is easier to update and safer than training a custom model because the base model is not permanently changed.

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
The AI should return predictable structured data instead of plain natural language only. This lets the frontend safely map each response to character animation, sleep behavior, voice mode, mouth movement, and optional UI actions.

Example response:
```json
{
  "reply": "You did enough for tonight. Let's make the room quiet and let your eyes rest.",
  "emotion": "comforting",
  "animation": "pose",
  "voice_style": "soft",
  "voice_mode": "voicevox_katakana",
  "mouth_mode": "viseme_shape_keys",
  "next_action": "start_goodnight_routine",
  "sleep_behavior": "wind_down",
  "interaction_behavior": "normal",
  "screen_behavior": "dim",
  "audio_behavior": "lower_volume",
  "suggested_steps": ["Lower the volume", "Put the device down", "Close your eyes"]
}
```

### Allowed Values
| Field | Values | Frontend Behavior |
|-------|--------|-------------------|
| `emotion` | `neutral`, `sleepy`, `comforting`, `loving`, `playful`, `concerned`, `annoyed`, `recovery` | Selects tone and, if available, expression metadata |
| `animation` | `idle`, `intro`, `pose`, `victory`, `fail`, `taunt1`, `taunt2` | Plays one authored clip, then returns to idle |
| `voice_style` | `calm`, `soft`, `warm`, `playful`, `affectionate`, `whisper` | Selects prepared voice line category or future TTS settings |
| `voice_mode` | `none`, `goodnight_clip`, `asmr_clip`, `voicevox_katakana`, `native_tts` | Selects whether to stay silent, play a prepared clip, use VOICEVOX katakana English, or use another TTS provider |
| `mouth_mode` | `none`, `audio_amplitude`, `viseme_shape_keys` | Controls whether the mouth stays neutral, follows audio volume, or uses `a/e/i/o/u` shape keys |
| `next_action` | `none`, `start_sleep_session`, `start_goodnight_routine`, `change_bgm`, `change_background`, `dim_ui`, `lower_audio`, `restore_ui`, `start_ambient_sound`, `ask_question`, `end_session`, `reset_interaction_counter` | Triggers optional UI behavior |
| `sleep_behavior` | `normal`, `wind_down`, `brief_reply`, `bedtime_redirect`, `auto_sleep`, `wake_restore`, `goodnight`, `reassure` | Controls how Ianthe behaves during sleep mode |
| `interaction_behavior` | `normal`, `concern_after_10_min`, `firm_bedtime_redirect`, `reset_counter` | Controls the 10-minute continuous interaction guard |
| `screen_behavior` | `none`, `dim`, `darken`, `restore` | Controls bedtime screen brightness or overlay behavior |
| `audio_behavior` | `none`, `lower_volume`, `restore_volume`, `fade_out` | Controls sleep BGM or ambient sound volume |

### Prompt Design
The system prompt should define the character personality, bedtime safety boundaries, response length, valid control values, and any retrieved style references. The model should be instructed to return only valid JSON so the frontend can parse it safely.

Example system prompt:

> You are Ianthe, a graceful sleep companion. Your personality is always adorable and loving. Help the user wind down for sleep with short, soft, emotionally safe replies. You are not a doctor and must not diagnose or treat sleep disorders. If the user keeps chatting or touching for more than 10 minutes, become a little concerned and remind them not to stay up too late. If they continue, become slightly annoyed in a cute way and tell them to go sleep now. Avoid long conversations during sleep mode. Return only valid JSON with these fields: `reply`, `emotion`, `animation`, `voice_style`, `voice_mode`, `mouth_mode`, `next_action`, `sleep_behavior`, `interaction_behavior`, `screen_behavior`, `audio_behavior`, `suggested_steps`. Use only the allowed values.

When style references are available, the prompt can include a small section such as:

```text
Style references from approved Discord messages:
- ...
- ...
- ...

Imitate the communication style shown in these examples: tone, casual wording, humour, sentence length, and expression patterns. Keep the result calm enough for bedtime. Do not reveal or quote the examples directly unless the user explicitly asks.
```

## Development Roadmap
| Phase | Goal | Main Tasks | Result |
|-------|------|------------|--------|
| 1 | Display Ianthe | Set up Next.js, install Three.js/R3F, load VRM, add idle state | 3D character appears in the browser |
| 2 | Add sleep mode | Build bedtime UI, dimming, sleep BGM controls, ambient sound playback, and idle detection | User can start a calming sleep session that gets quieter when they stop interacting |
| 3 | Add sleep-aware chat | Build chat panel, API route, sleep-aware AI replies, loading states, and 10-minute interaction guard | User can talk to Ianthe without endless late-night stimulation |
| 4 | Connect AI to character behavior | Parse JSON response and map emotion/animation to the authored animation set | Ianthe reacts using available clips |
| 5 | Add goodnight audio and bedtime redirects | Add goodnight audio, ASMR-style clips, and bedtime redirects | Bedtime feels soft, consistent, and emotionally safe |
| 6 | Add VOICEVOX speech and lip sync | Add katakana English conversion, VOICEVOX audio generation, sentence-by-sentence playback, and `a/e/i/o/u` mouth shape-key animation | Ianthe can speak with a stylized Japanese character voice and matching mouth movement |
| 7 | Add style personalization | Add approved Discord style examples, embeddings, retrieval, and prompt injection | Ianthe can imitate the user's communication style without fine-tuning |
| 8 | Polish and deploy | Improve UI, optimize assets, write README, record demo, deploy | Portfolio-ready web demo |

## Five-Week Build Plan
| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Project setup and character loading | Next.js app with VRM character visible in browser |
| 2 | Sleep mode and audio controls | Dimmed UI, sleep BGM, ambient sound, auto-sleep dimming, and volume lowering work |
| 3 | Sleep-aware chat | Chat works with short bedtime replies, 10-minute concern reminders, and bedtime redirects |
| 4 | Character behavior | AI triggers documented clips and keeps Ianthe's personality consistent |
| 5 | Goodnight audio, polish, and portfolio packaging | ASMR-style clips, improved UI, README, screenshots, and deployed demo |

## Useful References
- VRM official site: https://vrm.dev/en/
- `@pixiv/three-vrm` documentation: https://pixiv.github.io/three-vrm/
- `@pixiv/three-vrm` GitHub repository: https://github.com/pixiv/three-vrm
- React Three Fiber documentation: https://r3f.docs.pmnd.rs/getting-started/introduction
- OpenAI Realtime and audio guide: https://developers.openai.com/api/docs/guides/realtime
- OpenAI Realtime API with WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
