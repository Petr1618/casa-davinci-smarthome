# Industrial Dark UI Style Guide

A modern, dark-themed design system inspired by industrial control panels and monitoring dashboards. Features high contrast, clean typography, and semantic color coding for data visualization.

---

## Design Philosophy

- **Dark-first**: Black backgrounds with semi-transparent card overlays
- **High contrast**: White text on dark backgrounds for readability
- **Semantic colors**: Each data type has a distinct, meaningful color
- **Industrial aesthetic**: Clean lines, monospace-influenced typography, status indicators
- **Information density**: Compact layouts with clear visual hierarchy
- **Responsive grids**: Flexible layouts that adapt to content

---

## Color Palette

### CSS Variables

```css
:root {
  /* Backgrounds */
  --bg-primary: #000000;
  --bg-card: rgba(30, 30, 30, 0.8);
  --bg-card-solid: #1e1e1e;
  --bg-input: rgba(0, 0, 0, 0.3);

  /* Semantic Colors */
  --color-solar: #f5c542;      /* Yellow - Solar/Energy generation */
  --color-battery: #44d62c;    /* Green - Battery/Storage/Positive */
  --color-grid: #888888;       /* Gray - Grid/External/Neutral */
  --color-home: #3b9eff;       /* Blue - Home/Consumption/Info */
  --color-warning: #ffa500;    /* Orange - Warning/Service/Attention */
  --color-danger: #ff4444;     /* Red - Danger/Error/Maximum */
  --color-cool: #00b4d8;       /* Cyan - Cool/Minimum/Temperature low */

  /* Text */
  --text-primary: #ffffff;
  --text-secondary: #888888;

  /* Borders */
  --border-color: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.2);

  /* Accent (customizable per project) */
  --accent-color: #ffa500;
  --accent-hover: #ffb733;
}
```

### Color Usage Guidelines

| Color | Variable | Use For |
|-------|----------|---------|
| Yellow | `--color-solar` | Energy generation, solar, primary metrics |
| Green | `--color-battery` | Positive values, charging, success states |
| Blue | `--color-home` | Information, consumption, minimum values |
| Gray | `--color-grid` | Neutral, secondary, disabled states |
| Orange | `--color-warning` | Warnings, service mode, attention needed |
| Red | `--color-danger` | Errors, maximum values, danger states |
| Cyan | `--color-cool` | Cool temperatures, minimum values |

---

## Typography

### Font Stack

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Type Scale

| Element | Size | Weight | Transform | Spacing |
|---------|------|--------|-----------|---------|
| Page Title | 16px | 600 | uppercase | 1px |
| Section Title | 12px | 600 | uppercase | 1px |
| Card Header | 11px | 600 | uppercase | 1px |
| Body Text | 13px | 400 | none | normal |
| Labels | 10px | 400 | uppercase | 0.5px |
| Small Labels | 9px | 400 | uppercase | normal |
| Values (large) | 28px | 300 | none | normal |
| Values (medium) | 18px | 500 | none | normal |
| Values (small) | 14px | 500 | none | normal |
| Buttons | 11px | 500 | uppercase | 0.5px |

### Typography CSS

```css
/* Section titles */
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Large display values */
.value-large {
  font-size: 28px;
  font-weight: 300;
  color: var(--text-primary);
}

/* Standard labels */
.label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

---

## Spacing

### Base Unit: 4px

| Token | Value | Use |
|-------|-------|-----|
| `--space-xs` | 4px | Tight gaps |
| `--space-sm` | 8px | Component internal spacing |
| `--space-md` | 12px | Standard gaps |
| `--space-lg` | 16px | Card padding |
| `--space-xl` | 20px | Section spacing |
| `--space-2xl` | 24px | Layout padding |

### Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 6px | Buttons, inputs |
| `--radius-md` | 8px | Small cards, badges |
| `--radius-lg` | 12px | Cards, panels |
| `--radius-full` | 20px | Pills, status badges |

---

## Components

### Cards

```css
.card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.card-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
```

```html
<div class="card">
  <div class="card-header">Card Title</div>
  <div class="card-content">
    <!-- Content -->
  </div>
</div>
```

### Accent Header Card

For important sections that need visual prominence:

```css
.card-accent {
  background: linear-gradient(135deg, rgba(255, 165, 0, 0.1), rgba(30, 30, 30, 0.8));
  border: 1px solid var(--accent-color);
  border-radius: 8px;
  padding: 12px 24px;
}

.card-accent-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-color);
  letter-spacing: 1px;
  text-transform: uppercase;
}
```

### Buttons

```css
.btn {
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(30, 30, 30, 0.8);
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.btn-primary {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: #000;
}

.btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.btn-danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.btn-danger:hover {
  background: rgba(255, 68, 68, 0.1);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

```html
<button class="btn">Default</button>
<button class="btn btn-primary">Primary</button>
<button class="btn btn-danger">Danger</button>
```

### Status Indicators

```css
.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-indicator.connected {
  background: rgba(68, 214, 44, 0.15);
  color: var(--color-battery);
  border: 1px solid rgba(68, 214, 44, 0.3);
}

.status-indicator.disconnected {
  background: rgba(136, 136, 136, 0.15);
  color: var(--text-secondary);
  border: 1px solid rgba(136, 136, 136, 0.3);
}

.status-indicator.warning {
  background: rgba(255, 165, 0, 0.15);
  color: var(--color-warning);
  border: 1px solid rgba(255, 165, 0, 0.3);
}

.status-indicator.error {
  background: rgba(255, 68, 68, 0.15);
  color: var(--color-danger);
  border: 1px solid rgba(255, 68, 68, 0.3);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
```

```html
<div class="status-indicator connected">
  <span class="status-dot"></span>
  <span>Connected</span>
</div>
```

### Data Grid Boxes

For displaying individual data points (cells, sensors, etc.):

```css
.data-box {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
  transition: all 0.2s;
}

.data-box:hover {
  border-color: var(--border-hover);
}

.data-box.highlight-min {
  border-color: var(--color-home);
  background: rgba(59, 158, 255, 0.1);
}

.data-box.highlight-max {
  border-color: var(--color-danger);
  background: rgba(255, 68, 68, 0.1);
}

.data-box.highlight-active {
  border-color: var(--color-warning);
  background: rgba(255, 165, 0, 0.1);
}

.data-box-label {
  font-size: 9px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.data-box-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
```

```html
<div class="data-box">
  <div class="data-box-label">Cell 1</div>
  <div class="data-box-value">3.421V</div>
</div>
```

### Form Inputs

```css
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-input,
.form-select {
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--accent-color);
}

.form-input::placeholder {
  color: var(--text-secondary);
}
```

```html
<div class="form-field">
  <label class="form-label">Port Path</label>
  <input type="text" class="form-input" placeholder="/dev/ttyUSB0">
</div>
```

### Stats Display

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
}

.stat {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.stat-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
}

.stat-value.positive { color: var(--color-battery); }
.stat-value.negative { color: var(--color-danger); }
.stat-value.warning { color: var(--color-warning); }
```

### Tabs

```css
.tabs {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.tab {
  flex: 1;
  padding: 10px 16px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.tab.active {
  background: var(--accent-color);
  color: #000;
}

.tab.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Alert/Alarm Items

```css
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.3);
  border-radius: 6px;
}

.alert-item.warning {
  background: rgba(255, 165, 0, 0.1);
  border-color: rgba(255, 165, 0, 0.3);
}

.alert-item.info {
  background: rgba(59, 158, 255, 0.1);
  border-color: rgba(59, 158, 255, 0.3);
}

.alert-icon {
  font-size: 16px;
}

.alert-text {
  font-size: 12px;
  color: var(--text-primary);
}

.alert-ok {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  color: var(--color-battery);
  font-size: 13px;
}
```

### LED Indicators

```css
.led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-secondary);
  box-shadow: none;
  transition: all 0.2s;
}

.led.on {
  background: var(--color-battery);
  box-shadow: 0 0 8px var(--color-battery);
}

.led.off {
  background: var(--text-secondary);
  opacity: 0.3;
}

.led.warning {
  background: var(--color-warning);
  box-shadow: 0 0 8px var(--color-warning);
}

.led.error {
  background: var(--color-danger);
  box-shadow: 0 0 8px var(--color-danger);
}
```

---

## Layout Patterns

### Two-Column Grid

```css
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .row {
    grid-template-columns: 1fr;
  }
}
```

### Data Grid (8 columns for cells)

```css
.data-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

@media (max-width: 768px) {
  .data-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

### Flex Summary Row

```css
.summary-row {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

### Page Layout

```css
.page-layout {
  padding: 80px 24px 40px;
  max-width: 1400px;
  margin: 0 auto;
}
```

---

## Toast Notifications

```css
.notification-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-toast {
  padding: 16px 20px;
  background: var(--bg-card-solid);
  border-radius: 8px;
  border-left: 4px solid var(--accent-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  animation: slideIn 0.3s ease;
  max-width: 350px;
}

.notification-toast.warning {
  border-left-color: var(--color-warning);
}

.notification-toast.error {
  border-left-color: var(--color-danger);
}

.notification-toast.info {
  border-left-color: var(--color-home);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

---

## Complete Example: Service Panel

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Panel</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Include CSS variables and component styles from above */
  </style>
</head>
<body>
  <div class="page-layout">
    <!-- Accent Header -->
    <div class="card-accent" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <div class="card-accent-title">Service Mode</div>
        <div style="font-size: 11px; color: var(--text-secondary);">Connected: /dev/ttyUSB0</div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <div class="status-indicator connected">
          <span class="status-dot"></span>
          <span>Connected</span>
        </div>
        <button class="btn">Refresh</button>
        <button class="btn btn-danger">Disconnect</button>
      </div>
    </div>

    <!-- Data Grid -->
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">Cell Voltages</div>
      <div class="data-grid">
        <div class="data-box highlight-min">
          <div class="data-box-label">Cell 1</div>
          <div class="data-box-value">3.218V</div>
        </div>
        <div class="data-box">
          <div class="data-box-label">Cell 2</div>
          <div class="data-box-value">3.224V</div>
        </div>
        <!-- ... more cells -->
      </div>
      <div class="summary-row" style="margin-top: 12px;">
        <div class="summary-item">
          <span class="form-label">Min</span>
          <span class="stat-value" style="color: var(--color-home);">3.218V</span>
        </div>
        <div class="summary-item">
          <span class="form-label">Max</span>
          <span class="stat-value" style="color: var(--color-danger);">3.245V</span>
        </div>
        <div class="summary-item">
          <span class="form-label">Delta</span>
          <span class="stat-value" style="color: var(--color-battery);">27mV</span>
        </div>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="row">
      <div class="card">
        <div class="card-header">Pack Status</div>
        <div class="stats-grid">
          <div class="stat">
            <div class="stat-label">Voltage</div>
            <div class="stat-value">54.21V</div>
          </div>
          <div class="stat">
            <div class="stat-label">Current</div>
            <div class="stat-value positive">+48.2A</div>
          </div>
          <div class="stat">
            <div class="stat-label">Power</div>
            <div class="stat-value positive">2612W</div>
          </div>
          <div class="stat">
            <div class="stat-label">SOC</div>
            <div class="stat-value">78%</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Alarms</div>
        <div class="alert-ok">
          <span>✓</span>
          <span>All systems normal</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## Best Practices

1. **Use semantic colors consistently** - Green for positive/good, red for negative/bad, orange for warnings
2. **Maintain visual hierarchy** - Larger, bolder text for important values; smaller, muted text for labels
3. **Use borders sparingly** - Rely on background color differences and spacing for separation
4. **Highlight extremes** - Use colored borders/backgrounds to call out min/max values
5. **Keep labels uppercase** - Creates a technical, industrial feel
6. **Use transitions** - Subtle 0.2s transitions on interactive elements
7. **Maintain contrast** - Ensure text is readable against backgrounds (WCAG AA minimum)

---

## Customization

To adapt this design system for different projects, modify the accent color:

```css
:root {
  /* Energy/Solar Project */
  --accent-color: #f5c542;

  /* Network/IT Project */
  --accent-color: #3b9eff;

  /* Industrial/Manufacturing */
  --accent-color: #ffa500;

  /* Medical/Health */
  --accent-color: #44d62c;
}
```

---

*Created from Casa DaVinci Smart Home project - Industrial monitoring dashboard design*
