import json
import re
import requests
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from .crud import get_org_id
from .extensions import limiter
from .models import InventoryItem, CateringEvent, Recipe

bp = Blueprint("ai", __name__, url_prefix="/ai")

JSON_FENCE_RE = re.compile(r"```json|```")

# Same limit string on every route below, read from config so it's
# changeable per-deployment without a code change (AI_RATE_LIMIT env var).
def _ai_limit():
    return current_app.config["AI_RATE_LIMIT"]


def call_ai(prompt):
    """
    Calls an OpenAI-compatible /chat/completions endpoint (Groq, OpenRouter, etc).
    Returns (text, error) — exactly one will be None.
    """
    cfg = current_app.config
    if not cfg["AI_API_KEY"]:
        return None, "AI_API_KEY is not configured on the server."

    try:
        resp = requests.post(
            f"{cfg['AI_BASE_URL']}/chat/completions",
            headers={
                "Authorization": f"Bearer {cfg['AI_API_KEY']}",
                "Content-Type": "application/json",
            },
            json={
                "model": cfg["AI_MODEL"],
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
    except requests.RequestException:
        return None, "Couldn't reach the AI provider. Check your connection and try again."

    if resp.status_code == 429:
        return None, "AI provider is rate-limiting requests right now. Wait a moment and try again."
    if not resp.ok:
        return None, f"AI provider error (status {resp.status_code})."

    try:
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError):
        return None, "AI provider returned an unexpected response shape."

    if not text:
        return None, "AI returned an empty response. Please try again."

    return text, None


def call_ai_json(prompt):
    """Calls the AI and parses the response as JSON. Returns (data, error)."""
    text, error = call_ai(prompt)
    if error:
        return None, error
    try:
        cleaned = JSON_FENCE_RE.sub("", text).strip()
        return json.loads(cleaned), None
    except json.JSONDecodeError:
        return None, "AI returned a response that wasn't valid JSON. Try rephrasing and run it again."


@bp.route("/flavour", methods=["POST"])
@jwt_required()
@limiter.limit(_ai_limit)
def flavour():
    data = request.get_json() or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    prompt = f'''You are a culinary AI. Analyse this dish or ingredient: "{query}"
Return ONLY valid JSON, no markdown:
{{"name":"...","flavourProfile":["..."],"pairings":["...","...","..."],"cuisines":["..."],"moodTags":["..."],"chefNote":"one sentence tip","allergens":["..."],"complementaryRecipes":["...","..."]}}'''

    result, error = call_ai_json(prompt)
    if error:
        return jsonify({"error": error}), 502
    return jsonify(result)


@bp.route("/forecast", methods=["POST"])
@jwt_required()
@limiter.limit(_ai_limit)
def forecast():
    org_id = get_org_id()
    inventory = InventoryItem.query.filter_by(org_id=org_id).all()
    catering = CateringEvent.query.filter_by(org_id=org_id).all()

    def inv_status(i):
        if i.qty == 0 or i.qty < i.par_level * 0.55:
            return "critical"
        if i.qty < i.par_level:
            return "low"
        return "ok"

    inv_summary = "\n".join(
        f"{i.name}: {i.qty}{i.unit} (par {i.par_level}{i.unit}, status: {inv_status(i)})"
        for i in inventory
    )
    catering_summary = "\n".join(
        f"{c.name}: {c.date}, {c.pax} pax" for c in catering
    )

    prompt = f'''You are a procurement AI for a restaurant. Analyse the current inventory and upcoming catering events and suggest what to order.
Return ONLY valid JSON, no markdown:
{{"summary":"one-sentence overview","items":[{{"name":"...","qty":0,"unit":"...","reason":"...","urgency":"high|medium|low"}}],"totalEstimate":0,"notes":"..."}}

Current inventory:
{inv_summary}

Upcoming catering:
{catering_summary}'''

    result, error = call_ai_json(prompt)
    if error:
        return jsonify({"error": error}), 502
    return jsonify(result)


@bp.route("/voice-recipe", methods=["POST"])
@jwt_required()
@limiter.limit(_ai_limit)
def voice_recipe():
    data = request.get_json() or {}
    transcript = (data.get("transcript") or "").strip()
    if not transcript:
        return jsonify({"error": "transcript is required"}), 400

    prompt = f'''You are a recipe parser for a restaurant management system. Parse this chef narration into a structured recipe. Mark anything ambiguous with "?" so a human can verify.
Narration: "{transcript}"
Return ONLY valid JSON, no markdown:
{{"name":"...","category":"...","origin":"...","servings":0,"prepMins":0,"cookMins":0,"estCostUSD":0,
"ingredients":[{{"name":"...","qty":"...","unit":"...","confidence":"high|medium|low"}}],
"steps":["..."],"allergens":["..."],"flavours":["..."],
"notes":"any ambiguities the chef should verify"}}'''

    result, error = call_ai_json(prompt)
    if error:
        return jsonify({"error": error}), 502
    return jsonify(result)


@bp.route("/voice-stocktake", methods=["POST"])
@jwt_required()
@limiter.limit(_ai_limit)
def voice_stocktake():
    data = request.get_json() or {}
    transcript = (data.get("transcript") or "").strip()
    if not transcript:
        return jsonify({"error": "transcript is required"}), 400

    prompt = f'''You are an inventory assistant. Parse this verbal stocktake. Chef is reading off current stock levels.
Narration: "{transcript}"
Return ONLY valid JSON, no markdown:
[{{"name":"...","qty":0,"unit":"...","confidence":"high|medium|low"}}]'''

    result, error = call_ai_json(prompt)
    if error:
        return jsonify({"error": error}), 502
    return jsonify(result)
