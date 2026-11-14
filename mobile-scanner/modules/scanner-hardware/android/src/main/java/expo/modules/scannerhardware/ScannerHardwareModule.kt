package expo.modules.scannerhardware

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScannerHardwareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScannerHardware")

    Function("hasTorch") {
      val manager = appContext.reactContext?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
      runCatching {
        manager?.cameraIdList?.asSequence()
          ?.map(manager::getCameraCharacteristics)
          ?.firstOrNull { it.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK }
          ?.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      }.getOrDefault(false)
    }
  }
}
