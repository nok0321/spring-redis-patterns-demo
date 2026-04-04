import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ValueEditor } from '../../../components/cache/ValueEditor'

describe('ValueEditor', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初期値が文字列の場合、そのままtextareaに表示される', () => {
    render(
      <ValueEditor
        initialValue="hello world"
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('hello world')
  })

  it('初期値がオブジェクトの場合、整形されたJSONがtextareaに表示される', () => {
    const obj = { name: 'Alice', age: 30 }
    render(
      <ValueEditor
        initialValue={obj}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue(JSON.stringify(obj, null, 2))
  })

  it('「値を編集」ヘッダーが表示される', () => {
    render(
      <ValueEditor
        initialValue="test"
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByText('値を編集')).toBeInTheDocument()
  })

  it('保存ボタンとキャンセルボタンが表示される', () => {
    render(
      <ValueEditor
        initialValue="test"
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
  })

  it('有効なJSONでonSaveがパース済み値とともに呼ばれる', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)

    render(
      <ValueEditor
        initialValue={{ key: 'value' }}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({ key: 'value' })
    })
  })

  it('無効なJSONの場合はエラーメッセージが表示されonSaveは呼ばれない', async () => {
    const user = userEvent.setup()

    render(
      <ValueEditor
        initialValue="not valid json"
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(screen.getByText('JSON の形式が正しくありません')).toBeInTheDocument()
    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
    const user = userEvent.setup()

    render(
      <ValueEditor
        initialValue="test"
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  it('onSaveが失敗した場合はエラーメッセージを表示する', async () => {
    const user = userEvent.setup()
    mockOnSave.mockRejectedValue(new Error('保存に失敗'))

    render(
      <ValueEditor
        initialValue='"valid"'
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(screen.getByText('保存に失敗')).toBeInTheDocument()
    })
  })

  it('保存中は保存ボタンが「保存中...」に変わりdisabledになる', async () => {
    const user = userEvent.setup()
    let resolvePromise: () => void
    mockOnSave.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePromise = resolve
      })
    )

    render(
      <ValueEditor
        initialValue='"valid"'
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
    })

    resolvePromise!()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    })
  })

  it('テキストを編集するとエラーメッセージがクリアされる', async () => {
    const user = userEvent.setup()

    render(
      <ValueEditor
        initialValue="bad json"
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByText('JSON の形式が正しくありません')).toBeInTheDocument()

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, ' ')
    expect(screen.queryByText('JSON の形式が正しくありません')).not.toBeInTheDocument()
  })
})
