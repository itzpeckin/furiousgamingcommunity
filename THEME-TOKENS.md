# Theme Tokens

Theme values are available through `FranchiseHQ.theme.tokens`, `FranchiseHQ.theme.get(path)`, and CSS custom properties.

Token groups:
- `color`
- `spacing`
- `radius`
- `shadow`
- `motion`
- `zIndex`

Examples:

```js
FranchiseHQ.theme.get('color.accent');
```

```css
.my-component {
  padding: var(--fhq-spacing-lg);
  border-radius: var(--fhq-radius-md);
  color: var(--fhq-color-text);
}
```

The token layer is intentionally independent from final league branding.
