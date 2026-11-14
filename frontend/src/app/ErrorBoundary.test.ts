import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

describe('last-resort UI error boundary', () => {
  it('renders account guidance without SDK details or a suggestion to erase records', () => {
    const boundary = new ErrorBoundary({ children: null })
    boundary.state = { error: Object.assign(new Error('users/private-id token=secret'), { code: 'permission-denied' }) }
    const html = renderToStaticMarkup(boundary.render())
    expect(html).toContain('yetkin yok')
    expect(html).not.toMatch(/private-id|secret|permission-denied|verileri sıfırla/)
    expect(html).toContain('Sayfayı yenile')
  })
  it('keeps unknown render exceptions out of the product UI', () => {
    const boundary = new ErrorBoundary({ children: null })
    boundary.state = { error: new Error('unexpected internal payload') }
    expect(renderToStaticMarkup(boundary.render())).not.toContain('internal payload')
  })
})
