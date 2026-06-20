import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('smoke test', () => {
  it('renders hello world', () => {
    render(<div>Hello World</div>)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })
})
