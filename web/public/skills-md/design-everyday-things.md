---
name: design-everyday-things
description: Apply Don Norman's Design of Everyday Things — affordances, signifiers, mapping, feedback, constraints — to physical or digital interfaces. Use when users can't figure out how to do a basic task.
---

# Design of Everyday Things

Don Norman's fundamentals. If users can't use it without thinking, the design failed.

## The 6 principles

### 1. Affordance
What actions the object allows. A door handle affords pulling. A flat plate affords pushing. In UI: a button-looking element affords clicking; underlined text affords following a link.

### 2. Signifier
The perceptible signal that communicates the affordance. The "push" sign on a door. The cursor changing to a pointer. The subtle shadow under a button. Affordances without signifiers are invisible.

### 3. Mapping
Relationship between controls and their effects. Volume up = up. Steering left = left. In UI: settings panel on the right, applies to content on the right. Cluster proximity implies relationship.

### 4. Feedback
Immediate, informative response to any action. Button pressed → visual + audio + tactile. Long operation → progress with ETA. Missing feedback = user retries, causing duplicates.

### 5. Constraints
Prevent invalid states structurally rather than warning about them. Disabled submit button when form invalid. Date picker that greys out unavailable days. USB-C connects any way — no wrong orientation.

### 6. Conceptual model
The user's mental model of how the system works. Design the interface so the mental model users form matches how the system actually works — otherwise they will blame themselves for "errors" that are design flaws.

## Norman's Doors test
If a door needs a sign that says "push" or "pull", the design failed. Apply to your UI: if you need a tooltip explaining a button's purpose, the button design failed.

## Seven stages of action (for flow analysis)
1. Goal (what do I want?)
2. Plan (how do I get it?)
3. Specify (which actions?)
4. Perform (do it)
5. Perceive (what happened?)
6. Interpret (what does it mean?)
7. Compare (did I get closer to my goal?)

For each stage, ask: does the interface help or hurt? Bridges (helping the user across) = good design.

## The Error hierarchy
- **Slips**: right intention, wrong action (fat finger)
- **Mistakes**: wrong intention

Design to prevent both: constraints for slips, clear conceptual model for mistakes.
