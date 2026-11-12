import { registerRequiredSecret } from "@agent-native/core/secrets";

registerRequiredSecret({
  key: "AWX_CLIENT_ID",
  label: "Airwallex Sandbox Client ID",
  description:
    "Optional Airwallex sandbox client ID. Leave unset to run Clause against the deterministic in-memory Issuing mock.",
  docsUrl: "https://www.airwallex.com/docs/developer-tools__api__Obtain-access-token",
  scope: "user",
  kind: "api-key",
  required: false,
});

registerRequiredSecret({
  key: "AWX_API_KEY",
  label: "Airwallex Sandbox API Key",
  description:
    "Optional Airwallex sandbox API key paired with AWX_CLIENT_ID for real sandbox virtual card issuance.",
  docsUrl: "https://www.airwallex.com/docs/developer-tools__api__Obtain-access-token",
  scope: "user",
  kind: "api-key",
  required: false,
});

registerRequiredSecret({
  key: "AWX_CARDHOLDER_ID",
  label: "Airwallex Delegate Cardholder ID",
  description:
    "Optional pre-created DELEGATE cardholder ID in the Airwallex sandbox.",
  scope: "user",
  kind: "api-key",
  required: false,
});

registerRequiredSecret({
  key: "ANTHROPIC_API_KEY",
  label: "Anthropic API Key",
  description:
    "Optional Claude API key for live quote extraction, photo/PDF evidence evaluation, and change-order drafting. Leave unset to use bundled offline fixtures.",
  docsUrl: "https://console.anthropic.com/settings/keys",
  scope: "user",
  kind: "api-key",
  required: false,
});

export default () => {};
