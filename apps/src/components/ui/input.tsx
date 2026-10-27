// shadcn's base-nova input on the tokens. Its look is ./variants.ts's input recipe, which the landing
// page's fragments share: don't re-add it here with `shadcn add input --overwrite`. It sets no `type`
// unless given one, as the workspace's text boxes need (test/ask.test.ts counts them so), and turns
// autofill off unless a field asks for it (autoComplete="name"), so a roster, a budget or a network's
// name isn't offered a password manager's entries.
import { Input as InputPrimitive } from '@base-ui/react/input'
import { inputVariants } from './variants'

function Input({ className, type, autoComplete = 'off', ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      autoComplete={autoComplete}
      data-slot="input"
      className={inputVariants({ className })}
      {...props}
    />
  )
}

export { Input }
