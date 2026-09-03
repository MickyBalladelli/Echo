import { computed, signal } from '../lib/vendor.js'
import { EyeIcon, EyeOffIcon, IconButton, TextField } from '../lib/vendor.js'

export function PasswordField(props = {}) {
  const visible = signal(false)
  const type = computed(() => visible.value ? 'text' : 'password')
  const toggleLabel = computed(() => visible.value ? 'Hide password' : 'Show password')
  const toggleIcon = computed(() => visible.value ? EyeOffIcon({ size: '1.2em' }) : EyeIcon({ size: '1.2em' }))
  const { class: classValue = '', ...fieldProps } = props

  return (
    <div class="password-field">
      <TextField
        {...fieldProps}
        type={type}
        class={`password-field-input ${classValue}`}
      />
      <IconButton
        type="button"
        size="small"
        class="password-field-toggle"
        icon={toggleIcon}
        ariaLabel={toggleLabel}
        title={toggleLabel}
        pressed={visible}
        disabled={props.disabled}
        onClick={() => visible.value = !visible.value}
      />
    </div>
  )
}
