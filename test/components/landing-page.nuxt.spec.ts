import type { Component } from 'vue'
import { Logo } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { expect, it } from 'vitest'

declare module '#components' {
  export const Logo: Component
}

it('can mount some component', async () => {
  const component = await mountSuspended(Logo)
  expect(component.text()).toMatchInlineSnapshot(
    '"My app"',
  )
})
