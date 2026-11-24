#ifndef GX_UNDO_INTERNAL_H
#define GX_UNDO_INTERNAL_H
#include "native.h"

/* Private production state shared by capture and the existing UI undo code.
   The original four zero-initialized variables keep their value/lifetime. */
typedef struct {
 J *before,*keys;
 char label[160];
 int reversing;
} UndoCaptureState;
extern UndoCaptureState gx_undo_capture_state;

/* Keep the original function bodies unchanged; these aliases are private to
   operations.c and undo-capture.c and preserve the original lvalue semantics. */
#define undoBefore (gx_undo_capture_state.before)
#define undoKeys (gx_undo_capture_state.keys)
#define undoLabel (gx_undo_capture_state.label)
#define undoReversing (gx_undo_capture_state.reversing)
#endif
