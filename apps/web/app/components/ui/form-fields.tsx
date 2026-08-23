import type { InputHTMLAttributes, ReactNode } from 'react';

type UsernameFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'maxLength' | 'minLength' | 'name' | 'pattern' | 'type'
> & {
  label?: ReactNode;
  help?: ReactNode;
  name?: string;
  prefixed?: boolean;
};

export function UsernameField({
  label = 'Username',
  help,
  name = 'username',
  prefixed = false,
  ...inputProps
}: UsernameFieldProps) {
  const input = (
    <input
      {...inputProps}
      name={name}
      type="text"
      minLength={3}
      maxLength={30}
      pattern="[\p{L}\p{N}_]+"
    />
  );
  return (
    <label>
      {label}
      {prefixed ? (
        <div className="username-input">
          <span aria-hidden="true">@</span>
          {input}
        </div>
      ) : (
        input
      )}
      {help && <small>{help}</small>}
    </label>
  );
}
