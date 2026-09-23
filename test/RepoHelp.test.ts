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
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RepoHelp from '../src/ui/components/RepoHelp.vue'

// jsdom has <dialog> but not its modal methods.
const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true })
const close = vi.fn(function (this: HTMLDialogElement) { this.open = false })

beforeEach(() => {
  showModal.mockClear()
  close.mockClear()
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})

describe('RepoHelp', () => {
  it('opens the explanation as a modal from the i button', async () => {
    const wrapper = mount(RepoHelp, { attachTo: document.body })
    const dialog = wrapper.get('dialog').element as HTMLDialogElement
    expect(dialog.open).toBe(false)

    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    expect(showModal).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    expect(wrapper.get('dialog').text()).toContain('github.com/owner/repo')
    wrapper.unmount()
  })

  it('closes from the Close button and from a backdrop click, but not a content click', async () => {
    const wrapper = mount(RepoHelp, { attachTo: document.body })
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    await wrapper.get('dialog p').trigger('click')
    expect(close).not.toHaveBeenCalled()

    await wrapper.get('dialog').trigger('click')
    expect(close).toHaveBeenCalledOnce()

    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')
    const closeButton = wrapper.findAll('dialog button').find((b) => b.text() === 'Close')
    await closeButton!.trigger('click')
    expect(close).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
