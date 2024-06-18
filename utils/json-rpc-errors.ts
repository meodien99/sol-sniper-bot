
//https://www.jsonrpc.org/specification#error_object
export const BaseJSONRPCErrorCode = {
  PARSE_ERROR: -32700, // Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.
  INVALID_REQUEST: -32600,	// The JSON sent is not a valid Request object.
  METHOD_NOT_FOUND: -32601,	// The method does not exist / is not available.
  INVALID_PARAMS: -32602,	// Invalid method parameter(s).
  INTERNAL_ERROR: -32603, // Internal JSON-RPC error.
} as const;

//https://github.com/solana-labs/solana-web3.js/blob/55652a081113c59cf054305a70f5deec268f15f1/src/errors.ts#L34
export const SolanaJSONRPCErrorCode = {
  JSON_RPC_SERVER_ERROR_BLOCK_CLEANED_UP: -32001,
  JSON_RPC_SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE: -32002,
  JSON_RPC_SERVER_ERROR_TRANSACTION_SIGNATURE_VERIFICATION_FAILURE: -32003,
  JSON_RPC_SERVER_ERROR_BLOCK_NOT_AVAILABLE: -32004,
  JSON_RPC_SERVER_ERROR_NODE_UNHEALTHY: -32005,
  JSON_RPC_SERVER_ERROR_TRANSACTION_PRECOMPILE_VERIFICATION_FAILURE: -32006,
  JSON_RPC_SERVER_ERROR_SLOT_SKIPPED: -32007,
  JSON_RPC_SERVER_ERROR_NO_SNAPSHOT: -32008,
  JSON_RPC_SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED: -32009,
  JSON_RPC_SERVER_ERROR_KEY_EXCLUDED_FROM_SECONDARY_INDEX: -32010,
  JSON_RPC_SERVER_ERROR_TRANSACTION_HISTORY_NOT_AVAILABLE: -32011,
  JSON_RPC_SCAN_ERROR: -32012,
  JSON_RPC_SERVER_ERROR_TRANSACTION_SIGNATURE_LEN_MISMATCH: -32013,
  JSON_RPC_SERVER_ERROR_BLOCK_STATUS_NOT_AVAILABLE_YET: -32014,
  JSON_RPC_SERVER_ERROR_UNSUPPORTED_TRANSACTION_VERSION: -32015,
  JSON_RPC_SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED: -32016,
} as const;