# Ianthe's Lullaby

## GitHub Pages deployment

The app exports a static site to `out/`. The workflow in
`.github/workflows/pages.yml` builds and deploys every push to `main`.

One-time setup: open the repository's **Settings → Pages**, then set
**Build and deployment → Source** to **GitHub Actions**. If a workflow failed
before Pages was enabled, rerun it from the **Actions** tab.

Site URL: https://shu279.github.io/Ianthes-Lullaby/

```sh
npm ci
npm run dev

# Build with the GitHub Pages project path:
NEXT_PUBLIC_BASE_PATH=/Ianthes-Lullaby npm run build
```

The workflow gets the base path from GitHub Pages. Public model, animation,
texture, and music URLs use the same prefix through `lib/assetPath.ts`.
For root-domain hosting, omit `NEXT_PUBLIC_BASE_PATH`. Serve `out/` with a static
web server to preview an export; `next start` does not serve static exports.

## Recorded conversation

Click **話しかける** to start the voiced conversation. Choices play the matching
recording. BGM stays at the user's selected volume during dialogue. Choosing
another reply or hiding the page stops the previous recording.

The character's `Mouth_a` shape follows the recording's volume envelope at the
current audio playback position, closing during pauses and after playback.
`lib/voiceEnvelopes.json` is generated from the published WAVs; regenerate it
with `python3 scripts/generate-voice-envelopes.py` after changing the recordings.
The original `/voice/` folder is ignored by Git. Published WAVs and their volume
envelopes are tracked so GitHub Pages builds contain all required assets.

`lib/conversationTree.ts` contains the Japanese subtitles, choices, animation,
and audio URL for each node. The supplied `voice/` recordings numbered 001–011
are copied unchanged to `public/voice/001.wav`–`011.wav` for static hosting.
Recording 012 is only 0.19 seconds and has no identifiable dialogue; it is not
used. The final quiet scene is silent narration, shown in parentheses.

Conversation paths cover visiting to chat, talking about the day, and getting
sleepy together. Every branch can lead to a quiet ending. Run `npm test` for
graph, audio-asset, cancellation, and playback-error checks.

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
2. If the user is new, Ianthe asks for their name through a short predefined choice flow.
3. If the user has visited before, the app remembers their name from local storage or a cookie.
4. Ianthe asks one light check-in using fixed options, such as how tired the user feels or whether they want comfort, a lullaby, or quiet company.
5. The user chooses from predefined conversation options, adjusts the camera, changes the background, or turns BGM on or off.
6. If the user stops interacting for a set amount of time, the app automatically enters deeper sleep mode by lowering screen brightness and gradually reducing BGM volume.
7. If the user interacts again, the app gently restores brightness and BGM volume to the previous bedtime settings.
8. If the user follows too many conversation branches, Ianthe gently redirects them toward sleep instead of offering endless interaction.

### Always-Available Interactions
- Move through a predefined bedtime conversation with Ianthe.
- Choose reassurance, a short goodnight message, a calming prompt, a lullaby, or quiet company from fixed options.
- Move the camera to view Ianthe from different angles.
- Change the background and manually turn BGM on or off.

### Automatic Sleep Mode
If the user does not interact with the UI for a set idle period, the app should assume they may be falling asleep. It should automatically:
- Lower the screen brightness or apply a darker overlay.
- Gradually reduce BGM volume if music is currently enabled.
- Keep Ianthe in a quiet idle presence.

When the user interacts again, the app should gently restore the previous bedtime brightness and BGM volume instead of abruptly changing the scene.

## MVP Scope
The MVP should prove that the sleep routine, character presence, calming audio, and low-stimulation branching conversation work together without requiring hosted AI or local model setup.

### Included in MVP
- Branch-based text conversation with Ianthe.
- User input limited to predefined choices, simple name entry, and settings controls.
- 3D character loaded in the browser.
- Basic character states mapped to the documented animation set.
- Prewritten response nodes that drive reply text, emotion, conversational animation, and voice style metadata.
- Sleep preparation session.
- Single shuffled sleep BGM playlist with a manual music on/off button.
- Automatic idle-based sleep mode that lowers brightness and gradually reduces BGM volume.
- Camera controls for viewing the character.

### Later Phases
- Dynamic text-to-speech output.
- VOICEVOX speech using katakana-style English pronunciation.
- Lip sync using the character's Blender `a`, `e`, `i`, `o`, and `u` mouth shape keys.
- More advanced memory for preferences, music on/off setting, sleep routine settings, and favorite goodnight styles.
- Optional AI-generated conversation as a later enhancement only if cost and setup are acceptable.
- Mobile optimization.

## Conversation Components
| Component | Role | Phase |
|-----------|------|-------|
| Branching conversation tree | Provides fixed bedtime dialogue paths without AI runtime, GPU, API, or model download cost | MVP |
| Choice UI | Limits user input to safe, low-stimulation options | MVP |
| Conversation state | Tracks the current node, selected options, and when to redirect toward sleep | MVP |
| Response metadata | Each node provides reply text, emotion, animation, and optional voice style | MVP |
| Audio playback | Plays one shuffled sleep BGM playlist, goodnight clips, and prepared ASMR-style audio | MVP |
| Idle detection | Detects no UI interaction and triggers automatic sleep mode | MVP |
| VOICEVOX speech | Converts English replies into katakana-style pronunciation and synthesizes cute character voice audio | Phase 2 |
| Lip sync | Maps spoken text or generated audio timing to the character's `a/e/i/o/u` mouth shape keys | Phase 2 |
| Text-to-speech | Generates dynamic spoken replies with other TTS providers if natural English is needed | Phase 2 |
| Memory | Stores preferences, favorite audio, and recent sleep settings | Phase 2 |
| Conversation content expansion | Adds more authored branches, seasonal lines, and goodnight variants | Later |

### Animation Set
The current character documentation lists seven authored animation sequences:

| Animation | Best Use |
|-----------|----------|
| `idle` | Default waiting state, quiet breathing, and bedtime presence |
| `intro` | App load |
| `pose` | Ianthe introduces herself to the user |
| `sleep` | Sleeping reaction when entering automatic sleep mode |
| `surprise` | Surprised reaction for selected story or reassurance branches |
| `laugh` | Laughing reaction for playful predefined branches |

Only `idle`, `surprise`, and `laugh` should be selectable by conversation nodes. The other clips are deterministic frontend animations. For example, the app triggers `intro` on load, `pose` during introduction, and `sleep` when automatic sleep mode starts.

### Mouth Shape Keys and Lip Sync
The character model includes Blender mouth shape keys for `a`, `e`, `i`, `o`, and `u`. These can be exported with the character model and controlled in the browser as visemes.

For dynamic voice, the app can estimate mouth movement from the spoken text or from sentence-level timing:
- Convert the reply into phoneme or vowel-like chunks.
- Map each chunk to one of the available mouth shapes.
- Animate the shape key weights while the audio plays.
- Return the mouth to neutral when the sentence finishes.

For prepared goodnight or ASMR-style audio, the first version can use a simpler fallback: open and close the mouth based on audio volume, then add more accurate `a/e/i/o/u` timing later.

## Technical Architecture
The recommended architecture is a browser-first web stack that can be developed in VS Code and deployed as a shareable demo. The core viewer, character controls, sleep UI, conversation tree, and audio systems run in the browser. The MVP should not require hosted AI, local GPU inference, local model downloads, Ollama, or a cloud API key.

The MVP should use prewritten conversation nodes. This keeps the experience predictable, low-cost, mobile-friendly, and appropriate for bedtime. Optional AI can be added later, but it should not be required for the main experience.

### Recommended Stack
| Area | Tool | Purpose |
|------|------|---------|
| Editor | VS Code | TypeScript, React, API routes, debugging |
| Frontend | Next.js, React, TypeScript | Web app, routing, UI, API integration |
| 3D rendering | Three.js with React Three Fiber | Browser-based 3D scene |
| Avatar format | VRM | Portable humanoid character model |
| VRM runtime | `@pixiv/three-vrm` | Load and control VRM avatars |
| Conversation engine | Local TypeScript conversation tree | Zero-cost branching bedtime dialogue |
| Voice synthesis | VOICEVOX engine | Stylized Japanese character voice using katakana English |
| Text conversion | Katakana English converter | Converts English dialogue into Japanese-readable pronunciation text |
| Lip sync | Shape-key viseme controller | Drives Blender `a/e/i/o/u` mouth shapes during speech |
| Storage | LocalStorage first; SQLite or Supabase later | Settings, music on/off preference, recent sleep preferences, and selected dialogue history |
| Deployment | Vercel or similar | Public web demo |

### Branching Conversation Strategy
The app should minimize server cost, setup friction, and mobile storage use by using deterministic scripted conversation for the MVP.

Default MVP path:
- The app loads a local TypeScript/JSON conversation tree.
- The user chooses from predefined options.
- Each choice moves to the next conversation node.
- Each node returns character-facing metadata: reply text, emotion, animation, voice style, and next choices.
- Long or repeated conversation paths eventually redirect toward sleep.

Optional later paths:
- Add more authored conversation packs for different moods, seasons, and bedtime routines.
- Add imported text/audio content only when it can be shipped cheaply and predictably.
- Keep all default conversation paths usable without network inference or model downloads.

### System Flow
```text
User selects a predefined option
  -> Choice UI
  -> Conversation state machine
  -> Conversation node returns { reply, emotion, animation, voice_style, choices }
  -> Optional English-to-katakana conversion for VOICEVOX
  -> Optional VOICEVOX audio generation
  -> Character controller updates node-selected conversational animation
  -> Lip sync controller animates a/e/i/o/u mouth shape keys during speech
  -> Idle detector lowers or restores brightness/BGM volume based on interaction
  -> Sleep/audio systems update as needed
  -> Conversation UI displays reply and next choices
  -> Optional voice, lullaby, BGM, or ASMR-style audio plays
```

### Suggested Project Structure
```text
ianthes-lullaby/
  app/
    page.tsx
  components/
    CharacterCanvas.tsx
    VRMCharacter.tsx
    ConversationPanel.tsx
    SleepSession.tsx
    AudioControls.tsx
    AutoSleepMode.tsx
    LipSyncController.tsx
  lib/
    audio.ts
    characterState.ts
    conversation.ts
    conversationTree.ts
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
    animations/sleep.glb
    animations/surprise.glb
    animations/laugh.glb
    audio/sleep/
    audio/goodnight/
    audio/asmr/
  README.md
```

### Conversation Tree Design
Each conversation node should be small and predictable. It should include:
- `id`: stable node identifier.
- `reply`: Ianthe's short response text.
- `emotion`: visual/emotional state metadata.
- `animation`: one of `idle`, `surprise`, or `laugh`.
- `voice_style`: optional voice metadata for prepared clips or future TTS.
- `choices`: the next user-selectable options.
- `sleepRedirect`: optional flag for nodes that gently end interaction and guide the user toward rest.

Example node:
```json
{
  "id": "comfort_tired",
  "reply": "You carried enough for tonight. Let your shoulders loosen a little, and I will stay here quietly.",
  "emotion": "comforting",
  "animation": "idle",
  "voice_style": "soft",
  "choices": [
    { "label": "Goodnight message", "next": "goodnight_short" },
    { "label": "Quiet company", "next": "quiet_company" }
  ]
}
```

### VOICEVOX Katakana English Speech
Ianthe can use VOICEVOX for a cute, anime-style voice. Because VOICEVOX is mainly designed for Japanese speech synthesis, the app should not expect native English pronunciation directly. Instead, English replies can be converted into katakana-style pronunciation before being sent to VOICEVOX.

Example:
```text
Sleep well. I'll stay here quietly.
-> スリープ ウェル。アイル ステイ ヒア クワイエットリー。
```

The voice workflow would be:
```text
Conversation node provides a short English bedtime reply
  -> Reply is split into short sentences
  -> Each sentence is converted into katakana-style pronunciation
  -> VOICEVOX generates audio for each sentence
  -> Lip sync maps the spoken text or audio timing to a/e/i/o/u mouth shape keys
  -> The web app plays the audio while Ianthe animates and speaks
```

To make the interaction feel responsive, the app can use prepared clips first and add generated VOICEVOX speech later. The limitation is that generated VOICEVOX output will sound like katakana English rather than natural native English, but this can be treated as part of Ianthe's charm and character identity.

## Conversation Node Contract
Conversation nodes should return predictable structured data. The node should only decide character-facing response details. App behavior such as screen dimming, BGM volume, automatic sleep mode, lip-sync mode, and UI actions should be handled by deterministic frontend state.

Example response:
```json
{
  "id": "sleep_reassurance_1",
  "reply": "You did enough for tonight. Let's make the room quiet and let your eyes rest.",
  "emotion": "comforting",
  "animation": "idle",
  "voice_style": "soft",
  "choices": [
    { "label": "One more comforting line", "next": "comfort_line_2" },
    { "label": "I'm ready to sleep", "next": "goodnight_short" }
  ]
}
```

### Allowed Values
| Field | Values | Frontend Behavior |
|-------|--------|-------------------|
| `id` | stable string | Allows save/restore of conversation state |
| `reply` | short string | Displayed as Ianthe's line |
| `emotion` | `neutral`, `sleepy`, `comforting`, `loving`, `playful` | Selects tone and, if available, expression metadata |
| `animation` | `idle`, `surprise`, `laugh` | Lets conversation nodes choose only simple reaction clips; deterministic frontend state triggers `intro`, `pose`, and `sleep` directly |
| `voice_style` | `calm`, `soft`, `warm`, `playful`, `affectionate`, `whisper` | Optional metadata for prepared voice clips or future TTS settings |
| `choices` | array of fixed options | Defines what the user can select next |

Frontend-owned behavior:
- Deterministic frontend state triggers `intro`, `pose`, and `sleep`.
- Automatic sleep mode handles screen dimming and gradual BGM volume reduction.
- Audio controls decide whether the single shuffled BGM playlist is on or off, and whether to play goodnight clips, ASMR clips, VOICEVOX, or native TTS.
- Lip-sync code decides whether to use audio amplitude or `a/e/i/o/u` viseme shape keys.
- UI state decides when to start/end sessions, restore brightness, change background, or redirect long conversation paths.

### Writing Guidelines
Conversation lines should be authored rather than generated. They should:
- Stay short enough for bedtime.
- Avoid medical claims, diagnosis, or therapy language.
- Offer calm choices rather than encouraging endless back-and-forth.
- Keep Ianthe consistently adorable, loving, and gentle.
- Prefer sleep-supportive endings after several branches.

## Development Roadmap
The build should be handled in two tracks: asset/content preparation by the human creator, and implementation by Codex. The MVP should be completed before adding VOICEVOX, lip sync, generated speech, or optional generated-content modes.

### MVP Implementation Sequence
| Step | Goal | Human tasks | Codex tasks | Done when |
|------|------|-------------|-------------|-----------|
| 1 | Prepare character assets | Export the Ianthe model with mouth shape keys and provide animation files: `idle`, `intro`, `pose`, `sleep`, `surprise`, `laugh` | Create asset folders, define animation name constants, and add loading checks | The app can find all required model and animation files |
| 2 | Prepare audio/content assets | Provide one sleep BGM playlist, goodnight clips, and optional ASMR-style clips | Add audio folders, audio metadata, shuffled BGM playback, and playback utilities | BGM can play in random order and prepared audio files can be played in the browser |
| 3 | Scaffold the web app | Confirm project name, visual direction, and target desktop viewport | Set up Next.js, React, TypeScript, styling, base layout, and routing | A blank app runs locally with the correct project structure |
| 4 | Render Ianthe | Confirm model scale, default camera angle, and preferred framing | Implement `CharacterCanvas`, `VRMCharacter`, camera controls, and idle animation | Ianthe appears in the browser and can be viewed from different angles |
| 5 | Add sleep UI and audio controls | Choose initial background options and provide BGM on/off label | Implement sleep session UI, BGM on/off toggle, shuffled BGM playback, background switching, and dimmed bedtime UI | User can start a sleep session, toggle music, and control the visual atmosphere |
| 6 | Add automatic sleep mode | Choose idle timeout, target dim level, and target lowered BGM volume | Implement idle detection, automatic dimming, gradual BGM volume lowering, and restore-on-interaction | No UI interaction for the timeout lowers brightness and BGM volume; interaction restores them |
| 7 | Add branching conversation | Approve initial conversation paths, wording, and choice labels | Implement `ConversationPanel`, conversation tree, node validation, fixed choices, and reset/end states | Ianthe replies through prewritten nodes and the UI never requires AI setup |
| 8 | Map conversation to character behavior | Confirm when conversational reactions should use `idle`, `surprise`, or `laugh` | Map `emotion`, node-selected `animation`, and `voice_style` to character state while keeping intro, pose, sleep, screen, audio, and lip-sync behavior in frontend state machines | Conversation nodes can trigger simple reactions without controlling unrelated UI behavior |
| 9 | Polish MVP | Review wording, screenshots, and demo flow | Fix UI spacing, loading states, fallback states, README, and deployment settings | The MVP is presentable as a portfolio demo |

### Additional Functionality Sequence
| Step | Goal | Human tasks | Codex tasks | Done when |
|------|------|-------------|-------------|-----------|
| 1 | Add prepared voice/goodnight playback | Record or provide final goodnight and ASMR-style clips | Connect clips to frontend audio state, goodnight actions, and audio controls | Ianthe can play selected goodnight audio at the right moment |
| 2 | Add VOICEVOX speech | Install/run VOICEVOX locally or provide the target VOICEVOX setup and speaker choice | Add `voicevox.ts`, request audio from VOICEVOX, and play generated speech sentence by sentence | Ianthe can speak generated lines through VOICEVOX |
| 3 | Add katakana English conversion | Approve conversion style and examples | Implement `kanaEnglish.ts` and connect it before VOICEVOX synthesis | English replies are converted into cute katakana-style pronunciation |
| 4 | Add lip sync | Confirm exported mouth shape key names match `a`, `e`, `i`, `o`, `u` | Implement `LipSyncController` and `lipSync.ts` using audio amplitude first, then viseme timing | Ianthe's mouth moves while voice audio plays |
| 5 | Add memory | Decide what may be stored locally | Store name, BGM on/off preference, preferred background, favorite audio, and recent sleep settings | Returning users get personalized defaults |
| 6 | Expand conversation content | Choose additional moods, seasonal themes, and goodnight variants | Add more authored nodes and organize them into content packs | The app feels richer without requiring generated conversation |
| 7 | Mobile optimization | Review mobile layout and choice controls | Adapt layout, camera controls, and audio controls for mobile screens | The app is usable on mobile without layout breakage |

## Useful References
- VRM official site: https://vrm.dev/en/
- `@pixiv/three-vrm` documentation: https://pixiv.github.io/three-vrm/
- `@pixiv/three-vrm` GitHub repository: https://github.com/pixiv/three-vrm
- React Three Fiber documentation: https://r3f.docs.pmnd.rs/getting-started/introduction
