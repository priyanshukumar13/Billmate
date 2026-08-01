import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None


ALLOWED_CATEGORIES = {"Electricity", "Rent", "Subscription", "Other"}


def _get_llm_client():
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or OpenAI is None:
        return None

    base_url = os.getenv("OPENAI_BASE_URL", "").strip() or None
    if base_url:
        return OpenAI(api_key=api_key, base_url=base_url)
    return OpenAI(api_key=api_key)


def _llm_json(prompt, fallback):
    client = _get_llm_client()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    if client is None:
        return fallback

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        content = (resp.choices[0].message.content or "").strip()
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
        return fallback
    except Exception:
        return fallback


def _heuristic_classify(text):
    raw = (text or "").strip()
    lowered = raw.lower()

    title = raw
    if "to " in lowered:
        idx = lowered.find("to ")
        title = raw[idx + 3 :].strip().title() or "Untitled Bill"
    title = re.sub(r"[^A-Za-z0-9\s\-\_]", "", title).strip() or "Untitled Bill"

    category = "Other"
    if any(k in lowered for k in ["netflix", "spotify", "prime", "subscription", "hotstar"]):
        category = "Subscription"
    elif any(k in lowered for k in ["rent", "landlord"]):
        category = "Rent"
    elif any(k in lowered for k in ["electric", "electricity", "power", "utility"]):
        category = "Electricity"

    return {"title": title[:80], "category": category}


def classify_bill(text):
    fallback = _heuristic_classify(text)
    prompt = (
        "Extract bill title and category (Electricity, Rent, Subscription, Other) "
        f"from this text: {text}\n"
        'Return JSON exactly like {"title":"...","category":"..."}'
    )
    llm_out = _llm_json(prompt, fallback)

    title = str(llm_out.get("title", fallback["title"])).strip() or fallback["title"]
    category = str(llm_out.get("category", fallback["category"])).strip().title()
    if category not in ALLOWED_CATEGORIES:
        category = fallback["category"]

    return {"title": title[:80], "category": category}


def _parse_date(date_value):
    if not date_value:
        return None
    if isinstance(date_value, datetime):
        return date_value
    text = str(date_value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(text[: len(fmt)], fmt)
        except Exception:
            continue
    return None


def get_smart_reminder_days(user_id, bills_collection):
    try:
        query = {"status": "Paid"}
        if user_id:
            query["user_id"] = user_id

        paid_bills = list(
            bills_collection.find(
                query,
                {
                    "date": 1,
                    "paid_date": 1,
                    "updated_at": 1,
                },
            )
        )

        lead_days = []
        for bill in paid_bills:
            due = _parse_date(bill.get("date"))
            paid = _parse_date(bill.get("paid_date")) or _parse_date(bill.get("updated_at"))
            if not due or not paid:
                continue
            diff = (due.date() - paid.date()).days
            if 0 <= diff <= 30:
                lead_days.append(diff)

        if not lead_days:
            return [1, 3]

        counts = Counter(lead_days)
        common = [day for day, _ in counts.most_common(2)]
        return sorted(set(common))
    except Exception:
        return [1, 3]


def _compact_bills_for_prompt(user_data):
    compact = []
    for bill in user_data[:150]:
        compact.append(
            {
                "name": bill.get("name"),
                "amount": bill.get("amount"),
                "category": bill.get("category"),
                "date": bill.get("date"),
                "status": bill.get("status"),
            }
        )
    return compact


def generate_ai_response(query, user_data):
    compact_data = _compact_bills_for_prompt(user_data)
    fallback = {
        "answer": (
            "I could not use AI right now, but you can check your dashboard for "
            "due, unpaid, and monthly totals."
        )
    }
    prompt = (
        "You are a financial assistant. Answer clearly and briefly based only on this data.\n"
        f"Data: {json.dumps(compact_data)}\n"
        f"Question: {query}\n"
        'Return JSON like {"answer":"..."}'
    )
    result = _llm_json(prompt, fallback)
    answer = str(result.get("answer", fallback["answer"])).strip() or fallback["answer"]
    return answer


def generate_insights(data):
    monthly_total = float(data.get("monthly_total", 0.0))
    category_spending = data.get("category_spending", {})

    fallback_text = (
        f"This month you spent {monthly_total:.2f}. "
        f"Top categories: {', '.join([f'{k}: {v:.2f}' for k, v in category_spending.items()]) or 'No data'}."
    )

    prompt = (
        "Explain these spending patterns in simple terms for a regular user.\n"
        f"Monthly total: {monthly_total}\n"
        f"Category spending: {json.dumps(category_spending)}\n"
        'Return JSON like {"insight":"..."}'
    )
    result = _llm_json(prompt, {"insight": fallback_text})
    insight = str(result.get("insight", fallback_text)).strip() or fallback_text
    return insight


def compute_spending_metrics(bills):
    now = datetime.utcnow()
    month = now.month
    year = now.year
    category_totals = defaultdict(float)
    monthly_total = 0.0

    for bill in bills:
        due = _parse_date(bill.get("date"))
        if not due or due.month != month or due.year != year:
            continue
        try:
            amount = float(bill.get("amount", 0))
        except Exception:
            amount = 0.0
        monthly_total += amount
        category_totals[str(bill.get("category", "Other"))] += amount

    return {
        "monthly_total": round(monthly_total, 2),
        "category_spending": {k: round(v, 2) for k, v in category_totals.items()},
    }
