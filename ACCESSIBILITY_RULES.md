# Accessibility Rules (Baseline for Agentic AI + UI)

Purpose: Ensure all AI-driven and standard UI experiences are usable by people with disabilities, across keyboard-only, screen readers, low vision, and cognitive load needs.

These rules apply to:
- All UI screens (auth, dashboards, forms, chat)
- AI support/agentic workflows
- Any dynamic content or system messages

## 1. Text & Language
- Use clear, simple language; avoid jargon where possible.
- Short sentences, one idea per sentence.
- Provide concrete next steps or actions.
- Avoid sarcasm or ambiguous phrasing.
- Confirm critical actions (“I will cancel ride #12. Proceed?”).

## 2. Color & Contrast
- Text contrast must be at least 4.5:1 against background.
- Important information must never rely only on color (add text or icon labels).
- Avoid using color alone for error/success status.

## 3. Keyboard Access
- Every interactive element must be reachable with Tab/Shift+Tab.
- Focus order must follow visual order.
- Visible focus indicator is required on all buttons, links, inputs.
- All modals/overlays must trap focus and close with Escape.

## 4. Forms & Inputs
- Every input must have an associated visible label or `aria-label`.
- Error messages must be specific and inline with the field.
- Error messages should be announced via `aria-live="polite"` where relevant.
- Use input types correctly (`email`, `tel`, `number`, etc.).

## 5. AI Chat UI Behavior
- Every assistant message must be plain text (no color-only meaning).
- Provide user‑visible system status: “thinking…”, “error”, “retry”.
- Maintain readable line length and spacing.
- Preserve conversation history and make it scrollable.
- Provide a “copy response” option for long replies (optional but recommended).

## 6. Agentic Actions (Safety + Clarity)
- Before any action with side effects (cancel ride, change status, submit request):
  - Summarize the action in plain language.
  - Ask for confirmation.
- After action, confirm what changed and provide an easy undo or support path when possible.

## 7. Error Handling & Recovery
- Errors must be specific: what failed and how to fix it.
- Provide a retry option when possible.
- Do not silently fail; always show feedback.

## 8. Timeouts & Delays
- Long operations must show progress or “still working”.
- If AI response exceeds time limit, show a clear message and retry guidance.

## 9. Screen Reader Support
- Dynamic updates must be announced using `aria-live`.
- Use semantic HTML (headings in order, buttons for actions, links for navigation).
- Avoid inserting focus into non-interactive content.

## 10. Mobile & Zoom
- All screens must be usable at 200% zoom without horizontal scrolling.
- Touch targets should be at least 44x44px.

## 11. Logs & Privacy
- Do not expose sensitive user data in logs.
- AI prompts must not include secrets or passwords.

## 12. Testing Checklist (Must Pass)
- Navigate all pages with keyboard only.
- Verify contrast with a checker.
- Run a screen reader pass (NVDA/VoiceOver).
- Trigger at least one error and confirm messaging.

