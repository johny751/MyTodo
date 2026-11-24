#include "ui.h"
#include "undo-internal.h"
UndoCaptureState gx_undo_capture_state;
void undo_capture(DB*d,J*changes){if(!app.ready||d!=&app.db||!undoBefore||undoReversing)return;J*c;cJSON_ArrayForEach(c,changes){const char*k=str(c,"key");if(get(undoKeys,k))continue;ss(undoKeys,k,"capture");J*r=db_row(d,k);set(undoBefore,k,r?r:cJSON_CreateNull());}}
