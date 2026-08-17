---
name: verify-work
description: End-to-end verification before claiming a task complete — reproduce the user's original ask, run the code, view the output, compare to the requirement. Use as the last step of any implementation.
---

# Verify Work

Never say "done" without verifying. The most common failure mode is claiming completion based on the *intent* of the change, not the *effect*.

## The verification protocol

### 1. Restate the original ask
Copy the user's original request into a comment or scratch note. What exactly did they want? Not what you interpreted — what they wrote.

### 2. Define the success test
Before writing code: "This is done when [specific observable]." Never "when the code compiles" — always a behavior.

Examples:
- "When I click the button, the form submits and shows the success toast"
- "When I run `npm test`, all 42 tests pass"
- "When I visit /pricing, the new tier appears with the right price"

### 3. Execute the test yourself
For code:
- Run it. See the output. Read the actual output, not what you expect.
- For a script: `python foo.py` and inspect stdout
- For a web feature: open the browser, click through the flow
- For an API: `curl` or Postman, check status + body
- For a build: `npm run build` and confirm no errors

For content:
- Read it aloud
- Check every claim (numbers, names, dates)
- Verify links resolve

### 4. Test the failure paths
- What if the input is empty?
- What if the network fails?
- What if the user is not logged in?
- What if there are 0 results?
- What if there are 10,000 results?

### 5. Verify against the original ask again
Re-read step 1. Does what you have actually address it? Not "does it match your understanding" — does it match their words?

## Anti-patterns

### The "should work" fallacy
"The change should fix it." Verify or don't ship. Never trust theoretical correctness.

### The "compiled = correct" fallacy
TypeScript compiling means types line up. It does not mean the feature works. Run the feature.

### The "tests pass = done" fallacy
Tests pass if you wrote tests for the right things. If your test asserts the wrong behavior, green means broken.

### The "I edited the file = done" fallacy
Read the file back. Confirm the edit landed. Confirm no unintended changes.

## When to skip
You may skip verify-work only for:
- Documentation-only changes (still: read the doc back)
- Comment-only changes (still: read the diff)

Everything else requires the full protocol. Every time.

## Report format
When reporting done:
- What was asked: [one line]
- What was done: [one line]
- How I verified: [one line — command run, output observed]
- Known limitations: [any edge cases not tested]
