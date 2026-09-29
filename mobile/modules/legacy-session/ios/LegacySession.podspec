Pod::Spec.new do |s|
  s.name = 'LegacySession'
  s.version = '1.0.0'
  s.summary = 'One-time native client session reader'
  s.description = 'Reads the existing OnePlan credentials during the React Native upgrade.'
  s.license = { :type => 'Proprietary' }
  s.author = 'OnePlan'
  s.homepage = 'https://oneplan.space'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
