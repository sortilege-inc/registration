#!/usr/bin/env bash
# Create a Stripe product, price and Payment Link for one event.
#
# The site never holds a Stripe key: a Payment Link is a plain URL, and the
# registration's reference and email ride in its query string. This script is
# the only thing that touches the API, and it reads the key from a file outside
# every repo so the key is never an argument, never in shell history, and never
# printed.
#
#   ./scripts/stripe-event.sh --name "Hacksaw Dell" --amount 3500 --currency cad
#
# Pass --price price_xxx to reuse a price that already exists and only build the
# Payment Link — which is what you want after a half-finished run.
#
# Test mode is the default. --live is deliberately awkward to reach.
set -euo pipefail

KEY_FILE="${STRIPE_KEY_FILE:-$HOME/.secrets/stripe-claude.key}"
NAME="" DESCRIPTION="" AMOUNT="" CURRENCY="cad" PRICE_ID="" LIVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --name)        NAME="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --amount)      AMOUNT="$2"; shift 2 ;;   # in cents: 3500 = $35.00
    --currency)    CURRENCY="$2"; shift 2 ;;
    --price)       PRICE_ID="$2"; shift 2 ;;
    --live)        LIVE=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$PRICE_ID" ]; then
  [ -n "$NAME" ]   || { echo "--name is required (or --price to reuse one)" >&2; exit 2; }
  [ -n "$AMOUNT" ] || { echo "--amount is required, in cents" >&2; exit 2; }
  case "$AMOUNT" in (*[!0-9]*|'') echo "--amount must be whole cents, e.g. 3500" >&2; exit 2 ;; esac
fi

[ -r "$KEY_FILE" ] || { echo "No key at $KEY_FILE — see the Stripe section of README.md" >&2; exit 1; }
STRIPE_API_KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
export STRIPE_API_KEY

case "$STRIPE_API_KEY" in
  rk_test_*|sk_test_*) MODE="TEST" ;;
  rk_live_*|sk_live_*)
    MODE="LIVE"
    [ "$LIVE" = 1 ] || { echo "That key is LIVE but --live was not passed. Refusing." >&2; exit 1; }
    ;;
  *) echo "That does not look like a Stripe secret or restricted key." >&2; exit 1 ;;
esac

# Pull one field out of a Stripe response, and surface Stripe's own error text
# rather than dying on a half-parsed body — a missing key permission is the
# likeliest failure here and the message names the exact permission to add.
field() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    body = json.loads(raw)
except ValueError:
    sys.stderr.write("Could not parse the Stripe response:\n" + raw[:400] + "\n")
    sys.exit(1)
if isinstance(body, dict) and "error" in body:
    err = body["error"]
    sys.stderr.write("Stripe refused the call: " + err.get("message", "(no message)") + "\n")
    sys.exit(1)
key = sys.argv[1]
if key not in body:
    sys.stderr.write("No %s in the response.\n" % key)
    sys.exit(1)
print(body[key])
' "$1"
}

if [ -n "$PRICE_ID" ]; then
  echo "mode: $MODE   reusing price: $PRICE_ID"
  price_id="$PRICE_ID"
else
  echo "mode: $MODE   product: $NAME   price: $AMOUNT $CURRENCY"

  product_id=$(stripe products create \
    --name "$NAME" \
    ${DESCRIPTION:+--description "$DESCRIPTION"} | field id)
  echo "product: $product_id"

  price_id=$(stripe prices create \
    --product "$product_id" \
    --unit-amount "$AMOUNT" \
    --currency "$CURRENCY" | field id)
  echo "price:   $price_id"
fi

link=$(stripe payment_links create \
  -d "line_items[0][price]=$price_id" \
  -d "line_items[0][quantity]=1" \
  -d "after_completion[type]=hosted_confirmation" \
  -d "after_completion[hosted_confirmation][custom_message]=Thanks — your seat is paid for. Jordan will be in touch to confirm." \
  | field url)

echo
echo "Payment Link: $link"
echo
echo "Put that in the event's \`payment\` field in data.js."
