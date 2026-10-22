import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { configureValidationLocale } from './validation-locale';

/**
 * Reference pattern for feature forms (shadcn/ui Field + react-hook-form Controller + zod),
 * kept as a test so the integration of all three libraries is verified in CI.
 */
const schema = z.object({ label: z.string().trim().min(2) });
type Values = z.infer<typeof schema>;

function AddressLabelForm({ onSubmit }: { readonly onSubmit: (values: Values) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { label: '' } });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
    >
      <Controller
        name="label"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="address-label">Назва</FieldLabel>
            <Input {...field} id="address-label" aria-invalid={fieldState.invalid} />
            {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
          </Field>
        )}
      />
      <Button type="submit">Зберегти</Button>
    </form>
  );
}

describe('forms: react-hook-form + zod + shadcn Field', () => {
  afterEach(() => {
    configureValidationLocale('uk');
  });

  it('shows a localized validation error and does not submit invalid data', async () => {
    configureValidationLocale('uk');
    const user = userEvent.setup();
    const onSubmit = vi.fn<(values: Values) => void>();

    render(<AddressLabelForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    const error = await screen.findByRole('alert');
    expect(error.textContent).toMatch(/[А-ЯҐЄІЇа-яґєії]/); // Ukrainian zod message
    expect(screen.getByLabelText('Назва')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('switches validation messages with the app locale', async () => {
    configureValidationLocale('en');
    const user = userEvent.setup();

    render(<AddressLabelForm onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/[A-Za-z]/);
  });

  it('submits parsed values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(values: Values) => void>();

    render(<AddressLabelForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Назва'), '  Дім  ');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ label: 'Дім' });
  });
});
