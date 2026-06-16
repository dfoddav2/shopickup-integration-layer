import json
from pathlib import Path

result_file = Path(__file__).parent / "gls" / "pickup-points-result.json"

with open(result_file) as f:
    data = json.load(f)

payment_options = set()
for point in data.get("points", []):
    for option in point.get("paymentOptions", []):
        payment_options.add(option)

print("Unique payment options found:")
for option in sorted(payment_options):
    print(f"  - {option}")
