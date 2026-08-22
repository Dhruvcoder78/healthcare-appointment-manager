const OpenAI = require('openai');

let client = null;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

const PRE_VISIT_PROMPT_PREFIX =
  'Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ';

const POST_VISIT_PROMPT_PREFIX =
  'Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ';

const PRE_VISIT_SYSTEM_INSTRUCTION =
  'You are a clinical intake assistant. Respond with ONLY strict JSON, no prose, matching exactly this shape: ' +
  '{"urgencyLevel": "Low" | "Medium" | "High", "chiefComplaint": string, "suggestedQuestions": [string, string, string]}';

const POST_VISIT_SYSTEM_INSTRUCTION =
  'You are a patient communication assistant. Respond with ONLY strict JSON, no prose, matching exactly this shape: ' +
  '{"patientSummary": string, "medicationSchedule": [{"medication": string, "dosage": string, "schedule": string}], ' +
  '"followUpSteps": string, "followUpInDays": integer | null}. ' +
  'followUpInDays is the number of days from today until the recommended follow-up visit, or null if none is needed.';

const PRE_VISIT_FALLBACK = {
  urgencyLevel: 'MEDIUM',
  chiefComplaint: 'Unable to auto-generate a summary right now — please review the symptoms manually.',
  suggestedQuestions: [],
};

const POST_VISIT_FALLBACK = {
  patientSummary: 'Unable to auto-generate a patient-friendly summary right now. Your care team will follow up with the details manually.',
  medicationSchedule: [],
  followUpSteps: '',
  followUpInDays: null,
};

function normalizeUrgency(value) {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ['LOW', 'MEDIUM', 'HIGH'].includes(upper) ? upper : null;
}

async function callJsonCompletion(systemInstruction, userPrompt) {
  const completion = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('LLM response contained no content');
  }
  return JSON.parse(raw);
}

// Never throws — on any failure (network, auth, malformed JSON, etc.) it
// returns a safe fallback so appointment booking/documentation flows never
// crash because the LLM is unavailable.
async function generatePreVisitSummary(symptoms) {
  const prompt = `${PRE_VISIT_PROMPT_PREFIX}${symptoms}`;
  try {
    const parsed = await callJsonCompletion(PRE_VISIT_SYSTEM_INSTRUCTION, prompt);
    const urgencyLevel = normalizeUrgency(parsed.urgencyLevel) || PRE_VISIT_FALLBACK.urgencyLevel;
    const chiefComplaint =
      typeof parsed.chiefComplaint === 'string' && parsed.chiefComplaint.trim()
        ? parsed.chiefComplaint
        : PRE_VISIT_FALLBACK.chiefComplaint;
    const suggestedQuestions = Array.isArray(parsed.suggestedQuestions)
      ? parsed.suggestedQuestions.filter((q) => typeof q === 'string').slice(0, 3)
      : PRE_VISIT_FALLBACK.suggestedQuestions;

    return { success: true, data: { urgencyLevel, chiefComplaint, suggestedQuestions } };
  } catch (err) {
    console.error('[llmService] pre-visit summary generation failed:', err.message);
    return { success: false, data: PRE_VISIT_FALLBACK, error: err.message };
  }
}

async function generatePostVisitSummary(clinicalNotes) {
  const prompt = `${POST_VISIT_PROMPT_PREFIX}${clinicalNotes}`;
  try {
    const parsed = await callJsonCompletion(POST_VISIT_SYSTEM_INSTRUCTION, prompt);
    const patientSummary =
      typeof parsed.patientSummary === 'string' && parsed.patientSummary.trim()
        ? parsed.patientSummary
        : POST_VISIT_FALLBACK.patientSummary;
    const medicationSchedule = Array.isArray(parsed.medicationSchedule) ? parsed.medicationSchedule : [];
    const followUpSteps = typeof parsed.followUpSteps === 'string' ? parsed.followUpSteps : '';
    const followUpInDays = Number.isInteger(parsed.followUpInDays) ? parsed.followUpInDays : null;

    return { success: true, data: { patientSummary, medicationSchedule, followUpSteps, followUpInDays } };
  } catch (err) {
    console.error('[llmService] post-visit summary generation failed:', err.message);
    return { success: false, data: POST_VISIT_FALLBACK, error: err.message };
  }
}

module.exports = {
  generatePreVisitSummary,
  generatePostVisitSummary,
  PRE_VISIT_PROMPT_PREFIX,
  POST_VISIT_PROMPT_PREFIX,
};
