Pod::Spec.new do |s|
  s.name = 'ParityUI'
  s.version = '1.0.0'
  s.summary = 'OnePlan native rendering adapters'
  s.description = 'SwiftUI text transitions, the morphing tab bar and CoreImage QR encoding.'
  s.license = { :type => 'Proprietary' }
  s.author = 'OnePlan'
  s.homepage = 'https://oneplan.space'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  # Tab icons for AppTabBarView (copied from the native app's tabIcon asset folder).
  s.resource_bundles = { 'ParityUIAssets' => ['Assets.xcassets'] }
end
