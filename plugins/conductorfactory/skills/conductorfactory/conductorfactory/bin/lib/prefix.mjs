// Every comment the factory posts (issue or PR) starts with this prefix
// (identity.commentPrefix in the factory config). The factory acts
// with the owner's own gh login, so the prefix is the only way to
// tell factory messages from human ones.

import { config } from "./config.mjs";

export const PREFIX = config.identity.commentPrefix;

export const isFactory = (body = "") => body.trimStart().startsWith(PREFIX);

export const withPrefix = (body) => (isFactory(body) ? body : `${PREFIX} ${body.trimStart()}`);
