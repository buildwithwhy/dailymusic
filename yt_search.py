import re, subprocess, sys, json

queries = {
  "westend": "West End Blues Louis Armstrong Hot Five 1928",
  "sing": "Benny Goodman Sing Sing Sing 1937",
  "koko": "Charlie Parker Ko-Ko 1945 Savoy",
  "strangefruit": "Billie Holiday Strange Fruit 1939 official",
  "sowhat": "Miles Davis So What Kind of Blue official",
  "porkpie": "Charles Mingus Goodbye Pork Pie Hat Mingus Ah Um",
  "satchidananda": "Alice Coltrane Journey in Satchidananda official",
  "mannenberg": "Abdullah Ibrahim Mannenberg official",
  "kogun": "Toshiko Akiyoshi Kogun",
  "afroblue": "Robert Glasper Afro Blue Erykah Badu Blue Note",
}

def yt_search(q):
    url = "https://www.youtube.com/results?search_query=" + q.replace(" ", "+").replace("-", "%2D")
    html = subprocess.run(["curl", "-s", "-H", "Accept-Language: en", url],
                          capture_output=True, text=True).stdout
    # videoIds with their nearby titles from ytInitialData
    ids = re.findall(r'"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"', html)
    titles = re.findall(r'"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"\}\]', html)
    d = {i: t for i, t in titles}
    out = []
    for i in ids[:6]:
        out.append({"id": i, "title": d.get(i, "?")[:110]})
    return out

for key, q in queries.items():
    try:
        print("=== " + key + " ===")
        for r in yt_search(q):
            print(json.dumps(r))
    except Exception as e:
        print("ERR", key, e)
