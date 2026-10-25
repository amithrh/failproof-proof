// Stand-in for the `failproofai` module that the real loader injects.
export const registered = [];
export const customPolicies = { add: (p) => registered.push(p) };
export const allow = (reason) => (reason ? { decision: "allow", reason } : { decision: "allow" });
export const deny = (reason) => ({ decision: "deny", reason });
export const instruct = (reason) => ({ decision: "instruct", reason });
