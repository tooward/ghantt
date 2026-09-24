/*
 * Copyright 2026 Mike Ward
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from '../src/ui/components/SettingsPanel.vue'

// jsdom has <dialog> but not its modal methods.
const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true })
const close = vi.fn(function (this: HTMLDialogElement) { this.open = false })

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  showModal.mockClear()
  close.mockClear()
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})

describe('SettingsPanel', () => {
  it('opens as a modal when open becomes true', async () => {
    const wrapper = mount(SettingsPanel, { props: { open: false }, attachTo: document.body })
    expect(showModal).not.toHaveBeenCalled()

    await wrapper.setProps({ open: true })

    expect(showModal).toHaveBeenCalledOnce()
    expect(wrapper.get('#days-field').exists()).toBe(true)
    wrapper.unmount()
  })

  it('reports closing from the × button, and closes once the parent agrees', async () => {
    // As v-model does in App.vue: the parent writes the emitted value back.
    const wrapper = mount(SettingsPanel, {
      props: { open: true, 'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }) },
      attachTo: document.body,
    })
    // The dialog is shown once its element exists, a tick after mount.
    await flushPromises()
    expect(showModal).toHaveBeenCalledOnce()

    await wrapper.get('button[aria-label="Close settings"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(close).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('reports the dialog closing itself, as Esc does', async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true }, attachTo: document.body })

    await wrapper.get('dialog').trigger('close')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('closes on a backdrop click but not on a click inside', async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true }, attachTo: document.body })

    await wrapper.get('#settings-body').trigger('click')
    expect(wrapper.emitted('update:open')).toBeUndefined()

    await wrapper.get('dialog').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })
})
