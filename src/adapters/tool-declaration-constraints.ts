import { namespacedToolName, toolRestrictsCallers, type OcxTool } from "../types";

/**
 * Refuse a request whose tool declarations carry a restriction this wire cannot express.
 *
 * A declaration field is not decoration: `allowed_callers` says which callers may invoke the
 * tool, and a wire with no counterpart rebuilds the declaration without it. The model is then
 * offered a tool the caller had fenced off, and the caller gets an ordinary completion with no
 * way to tell the fence is gone (#5210). Refusing turns a silent widening into a 400 the caller
 * can act on, the same shape `ollama-native` and `kiro` already use for a tool_choice they
 * cannot enforce.
 *
 * Anthropic is the wire that defines the field and carries it; this guard is for the wires that
 * do not. It is a per-wire opt-in rather than a global check because only the adapter knows
 * whether its own target has a counterpart.
 */
export function assertToolCallerRestrictionsRepresentable(
  tools: readonly OcxTool[] | undefined,
  wire: string,
): void {
  const restricted = tools?.find(toolRestrictsCallers);
  if (!restricted) return;
  const name = namespacedToolName(restricted.namespace, restricted.name);
  throw new Error(
    `${wire} cannot express tools[].allowed_callers, declared on "${name}". `
    + "Route this request to an Anthropic-protocol provider, or remove the caller restriction.",
  );
}
