// src/invariant.js
var PACKAGE_NAME = "dsh-speech-input";
var name = "dsh-speech-input-invariant";
var inject = ["invariants"];
function apply(ctx) {
  return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, () => {
  }));
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=invariant.js.map
