# BillMate Dify Agent setup

## Backend configuration

Configure these values in the backend environment only:

- `DIFY_APP_API_KEY`: the API key created for the Dify **Agent application**. The existing `DIFY_API_KEY` name is also accepted.
- `DIFY_BASE_URL`: the Dify API base URL, normally `https://api.dify.ai/v1`. `DIFY_API_URL` takes precedence if both are set.
- `DIFY_BACKEND_TOOL_SECRET`: a long random secret shared by the backend and Dify's BillMate API tool authentication.
- `JWT_SECRET`: the backend JWT signing secret used to create short-lived, user-bound tool contexts.

Restart the backend after changing environment values. Do not put these secrets in frontend files or expose them to browser clients.

## Configure the Agent application manually

1. In Dify Studio, publish the Agent application and use that application's API key, not a Workflow application's key.
2. Confirm the Agent app accepts an input named `billmate_context_token`. BillMate sends a freshly signed, five-minute JWT in this input on every chat request.
3. Import [`billmate-openapi.json`](./billmate-openapi.json) as an API tool. Replace its example server URL with the public HTTPS URL of this BillMate backend if needed.
4. Configure the imported API tool to send `X-Dify-Tool-Secret` with the same value as the backend's `DIFY_BACKEND_TOOL_SECRET`.
5. In the Agent instructions/tool parameter mapping, pass the exact `billmate_context_token` input as `contextToken` for every operation: query parameter for GET tools and JSON body property for POST tools. Never substitute a user ID, a shared token, or a token copied from another request.
6. Do not configure tools that call BillMate's action-confirmation endpoints. Financial write tools only create pending proposals; the authenticated BillMate user confirms or cancels them through the app.
7. Test a read tool and a write proposal with two different BillMate accounts. Verify each sees only its own records, proposals require confirmation, and no secret appears in browser requests.

The backend calls the Agent chat API using `POST /v1/chat-messages` with `response_mode: "streaming"`, parses the Agent SSE response, and persists the returned `conversation_id` per BillMate conversation. The Dify Agent API does not support blocking mode.

Official references:

- [Dify Agent API](https://docs.dify.ai/en/api-reference/guides/agent)
- [Dify Send Chat Message](https://docs.dify.ai/en/api-reference/chat-messages/send-chat-message)
- [Dify End User Identity](https://docs.dify.ai/en/api-reference/guides/end-user-identity)
