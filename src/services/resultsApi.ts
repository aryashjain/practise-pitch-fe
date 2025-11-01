export interface SaveResultsPayload {
    topic: string;
    timeMs: number;
    questions: unknown; // keep generic to avoid tight coupling
    solutions: {
    userAnswers: Record<number, string>;
    score: number;
    };
}

export async function saveResultsToBackend(params: {
    resultsUrl: string;
    payload: SaveResultsPayload;
    accessToken?: string;
}): Promise<void> {
    const { resultsUrl, payload, accessToken } = params;

    const headers: Record<string, string> = { 'Content-Type':'application/json' };
if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

const resp = await fetch(resultsUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
});

if (!resp.ok) {
const text = await resp.text().catch(() => '');
throw new Error(`${resp.status} ${resp.statusText}${text ? `- ${text}` : ''}`);
}
}

export interface ResultsListItem {
    id: string;
    topic: string;
    created_at: string;
}

export interface ResultsListResponse {
data: ResultsListItem[];
meta: { page: number; limit: number; total: number; hasMore:
boolean };
}

export async function fetchResultsList(params: {
resultsUrl: string; // base, e.g. '/api/results'

accessToken: string;
page?: number;
limit?: number;
}): Promise<ResultsListResponse> {
const { resultsUrl, accessToken, page = 0, limit = 5 } = params;
const url = new URL(resultsUrl, window.location.origin);
url.searchParams.set('page', String(page));
url.searchParams.set('limit', String(limit));

const resp = await
fetch(url.toString().replace(window.location.origin, ''), {
headers: { Authorization: `Bearer ${accessToken}` },
});
if (!resp.ok) {
const text = await resp.text().catch(() => '');
throw new Error(`${resp.status} ${resp.statusText}${text ? `
- ${text}` : ''}`);
}
const json = await resp.json();
return { data: json.data, meta: json.meta } as
ResultsListResponse;
}

export interface ResultDetail {
id: string;
topic: string;
time_ms: number;
questions: unknown;
solutions: { userAnswers: Record<number, string>; score: number
};
created_at: string;

}

export async function fetchResultById(params: {
resultsUrl: string; // base, e.g. '/api/results'
accessToken: string;
id: string;
}): Promise<ResultDetail> {
const { resultsUrl, accessToken, id } = params;
const path = `${resultsUrl.replace(/\/$/,'')}/${encodeURIComponent(id)}`;
const resp = await fetch(path, { headers: { Authorization:`Bearer ${accessToken}` } });
if (!resp.ok) {
const text = await resp.text().catch(() => '');
throw new Error(`${resp.status} ${resp.statusText}${text ? `- ${text}` : ''}`);
}
const json = await resp.json();
return json.data as ResultDetail;
}