export interface HiddenInputProps {
  value: string;
  onChange(raw: string): void;
  onEnter(): void;
  testId: string;
  inputMode?: 'text';
  autoFocus?: boolean;
}

/**
 * A real input that cannot be seen, laid over the pixel text that shows what is in it: a tap on that brings up a
 * phone's keyboard, and a laptop's keys type into it. Its text is 16 px, so Safari on an iPhone does not zoom in.
 */
export function HiddenInput({ value, onChange, onEnter, testId, inputMode = 'text', autoFocus = false }: HiddenInputProps) {
  return (
    <input
      type="text"
      className="hidden-input"
      data-testid={testId}
      value={value}
      inputMode={inputMode}
      autoFocus={autoFocus}
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter();
      }}
    />
  );
}
