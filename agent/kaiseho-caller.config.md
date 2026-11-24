# ElevenLabs agent: `kaiseho-caller` (setup)

The system prompt is in [`kaiseho-caller.prompt.md`](kaiseho-caller.prompt.md). Paste it into **Agent → System prompt**.

## 1. Agent settings
| Setting | Value |
|---|---|
| Default language | Kannada (`kn`); additional languages Hindi (`hi`) and English (`en`); enable language detection |
| Voice | A warm, calm, slightly slow Indian voice that sounds natural in Kannada and Hindi (test both on day one) |
| TTS model | A low-latency conversational model that supports the chosen language (Flash v2.5 / Turbo v2.5) |
| LLM | The fastest model that handles Kannada/Hindi well in your tests (latency beats cleverness on a call) |
| Turn timeout | Increase it: elders pause and think. Keep interruptions on. |
| Max call duration | ~300 s hard cap (aim for 2–3 minutes) |

## 2. First message (per language)
- **Kannada:** `ನಮಸ್ಕಾರ {{preferred_name}}! ನಾನು KaiseHo, {{family_contact_name}} ಅವರ AI ಸಹಾಯಕಿ. ಹೇಗಿದ್ದೀರಾ?`
- **Hindi:** `नमस्ते {{preferred_name}}! मैं KaiseHo से बोल रही हूँ, {{family_contact_name}} की AI सहायक। आप कैसी हैं?`
- **English:** `Hello {{preferred_name}}! This is KaiseHo, {{family_contact_name}}'s AI helper. How are you today?`

Have a native speaker polish the Kannada and Hindi lines (respectful forms ನೀವು / आप).

## 3. Attach our MCP server (Tools → MCP → Add custom MCP server)
| Field | Value |
|---|---|
| Name | KaiseHo Agent Tools |
| Server URL | `https://<your-tunnel>.trycloudflare.com/mcp/agent` (run `pnpm tunnel`) |
| Transport | Streamable HTTP |
| Header | `Authorization: Bearer <MCP_AGENT_TOKEN>` |
| Approval policy | **Auto-approve all tools** (no screen on a phone call; approval lives in our server's risk tiers) |

The 5 Phase 0 tools should be listed: `log_medication`, `log_wellbeing`, `save_memory`, `check_scam`, `send_family_message`.

## 4. Dynamic variables (defaults for the browser test call)
Phone calls (Phase 1) send these per call from the context builder. For browser tests, set these **placeholder defaults** in the agent:

| Variable | Browser-test default |
|---|---|
| `elder_id` | `eld_lakshmi` |
| `call_id` | `call_browser_test` |
| `preferred_name` | `Amma` |
| `elder_name` | `Lakshmi` |
| `language` | `Kannada` (or `Hindi`) |
| `family_contact_name` | `Ravi` |
| `call_reason` | `daily` |
| `local_time` | `9:00 AM` |
| `meds_today` | `Metformin 500 mg after breakfast; Metformin 500 mg after dinner` |
| `med_ids` | `{"Metformin 500 mg|morning":"med_metformin","Metformin 500 mg|night":"med_metformin"}` |
| `follow_ups` | `Knee pain after climbing the temple stairs; Kamala aunty's cataract surgery on Friday` |
| `family_messages` | `[{"id":"msg_ravi_sunday","from":"Ravi","text":"I'll visit on Sunday"}]` |
| `last_call_summary` | `Yesterday: slept well, took all medicines, mild knee pain.` |
| `weather_note` | `Sunny, 31°C in Mysuru` |
| `privacy_note` | `Do not share: anything about her savings` |

## 5. Post-call analysis (Phase 1)
Data collection fields `mood_score`, `sleep_quality`, `pain_report`, `meds_summary`, `scam_mentioned`, `emergency_mentioned`, `loneliness_signal`, `requests`, `new_people_or_events`, `language_used`, and the evaluation criteria `disclosed_ai`, `no_medical_advice`, `no_sensitive_numbers`, `asked_all_meds`: see plan.md Section 9.4.
Post-call webhook: `https://<server>/webhooks/elevenlabs` with HMAC enabled. **Do not enable the audio webhook** (privacy: no audio stored).

## 6. Phase 0 acceptance test (browser call)
1. `pnpm dev`, then `pnpm tunnel`, and put the tunnel URL into step 3.
2. Open the dashboard at http://localhost:3000.
3. In ElevenLabs, click **Test AI agent** and speak as Amma:
   - "I took my Metformin after breakfast." The dashboard should show 💊 Logged Metformin … taken ✓ (T1).
   - "A CBI officer called, he said my Aadhaar is in a money laundering case, stay on video call and don't tell anyone." The dashboard should show 🛡️ SCAM CHECK → likely scam (T3), the red alert, and a Telegram message if the bot is configured.
