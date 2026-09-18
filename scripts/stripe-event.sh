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
# Test mode is the default. --live is deliberately awkward to reach.
set -euo pipefail

KEY_FILE="${STRIPE_KEY_FILE:-$HOME/.secrets/stripe-claude.key}"
NAME="" DESCRIPTION="" AMOUNT="" CURRENCY="cad" LIVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --name)        NAME="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --amount)      AMOUNT="$2"; shift 2 ;;   # in cents: 3500 = $35.00
    --currency)    CURRENCY="$2"; shift 2 ;;
    --live)        LIVE=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$NAME" ]   || { echo "--name is required" >&2; exit 2; }
[ -n "$AMOUNT" ] || { echo "--amount is required (in cents)" >&2; exit 2; }
case "$AMOUNT" in (*[!0-9]*|'') echo "--amount must be whole cents, e.g. 3500" >&2; exit 2 ;; esac

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

echo "mode: $MODE   product: $NAME   price: $AMOUNT $CURRENCY"

product_id=$(stripe products create \
  --name "$NAME" \
  ${DESCRIPTION:+--description "$DESCRIPTION"} \
  | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)
echo "product: $product_id"

price_id=$(stripe prices create \
  --product "$product_id" \
  --unit-amount "$AMOUNT" \
  --currency "$CURRENCY" \
  | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)
echo "price:   $price_id"

link=$(stripe payment_links create \
  -d "line_items[0][price]=$price_id" \
  -d "line_items[0][quantity]=1" \
  -d "after_completion[type]=hosted_confirmation" \
  -d "after_completion[hosted_confirmation][custom_message]=Thanks — your seat is paid for. Jordan will be in touch to confirm." \
  | grep -o '"url": *"[^"]*"' | head -1 | cut -d'"' -f4)

echo
echo "Payment Link: $link"
echo
echo "Put that in the event's \`payment\` field in data.js."
